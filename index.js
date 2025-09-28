require('dotenv').config();
const axios = require('axios');
const { initializeApp, getApps } = require('firebase/app');

// --- Environment Variable Validation ---
const requiredEnvVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'CYBERVIDYA_USERNAME',
    'PASSWORD',
    'BOT_TOKEN',
    'CHAT_ID'
];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.error(`FATAL: Missing required environment variables: ${missingVars.join(', ')}`);
    console.error("Please create a .env file in the project root and add these variables.");
    process.exit(1); // Exit the process with an error code
}
const { getDatabase, ref, set, get, goOffline } = require('firebase/database');

// --- Configuration ---
const LOGIN_URL = "https://kiet.cybervidya.net/api/auth/login";
const COURSES_URL = "https://kiet.cybervidya.net/api/student/dashboard/registered-courses";

// --- Firebase Initialization ---
// Ensure Firebase is initialized only once
let database;
if (!getApps().length) {
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        projectId: process.env.FIREBASE_PROJECT_ID
    };
    const firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
} else {
    database = getDatabase();
}

// --- Core Functions ---

async function login() {
    const userName = process.env.CYBERVIDYA_USERNAME;
    const password = process.env.PASSWORD;
    const payload = { userName, password };

    console.log('Attempting login...');
    try {
        const resp = await axios.post(LOGIN_URL, payload);
        console.log('Login successful');
        return {
            auth_pref: resp.data.data.auth_pref,
            token: resp.data.data.token
        };
    } catch (error) {
        console.error('Login failed:', error.message);
        if (error.response && error.response.data) {
            console.error('Server response:', error.response.data);
        }
        throw new Error('Login failed');
    }
}

async function fetch_courses(auth_pref, token) {
    const headers = { Authorization: auth_pref + token };
    console.log('Fetching courses...');
    try {
        const resp = await axios.get(COURSES_URL, { headers });
        console.log('Successfully fetched courses');
        return resp.data.data;
    } catch (error) {
        console.error('Error fetching courses:', error.message);
        if (error.response && error.response.status === 401) {
            throw new Error('Session expired or invalid');
        }
        throw new Error('Failed to fetch courses');
    }
}

async function send_telegram(msg) {
    const botToken = process.env.BOT_TOKEN;
    const chatId = process.env.CHAT_ID;
    if (!botToken || !chatId) {
        console.log("Telegram bot token or chat ID not set. Skipping message.");
        return;
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const payload = { chat_id: chatId, text: msg, parse_mode: "Markdown" };
    try {
        await axios.post(url, payload);
        console.log("Telegram message sent successfully.");
    } catch (error) {
        console.error("Error sending telegram message:", error.message);
    }
}

function calculateAttendanceMessage(course, present, total, status) {
    const percentage = total > 0 ? (present / total * 100) : 0;
    const statusMap = {
        "Present": "✅ PRESENT",
        "Absent": "❌ ABSENT",
        "Unknown": "⚠️ UNKNOWN"
    };
    const statusText = statusMap[status] || "⚠️ UNKNOWN";

    let msg = `📚 *${course}*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `${statusText}\n` +
              `📊 Attendance: ${present}/${total} lectures\n` +
              `📈 Percentage: *${percentage.toFixed(1)}%*\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (percentage < 75) {
        const x = Math.ceil((0.75 * total - present) / 0.25);
        msg += `⚠️ __CRITICAL ALERT__\n` +
               `📉 Below minimum requirement!\n` +
               `🎯 *Action Required:* Attend next ${Math.max(0, x)} lecture(s)\n`;
    } else {
        const y = Math.floor(present / 0.75 - total);
        msg += `✅ __ATTENDANCE SECURE__\n` +
               `🎉 Above 75% requirement!\n` +
               `🏖 *Flexibility:* Can skip up to ${Math.max(0, y)} lecture(s)\n`;
    }
    return msg;
}

async function getAttendanceState() {
    try {
        const attendanceRef = ref(database, 'attendance/state');
        const snapshot = await get(attendanceRef);
        return snapshot.exists() ? snapshot.val() : {};
    } catch (error) {
        console.error('Error reading from Firebase:', error);
        return {}; // Return empty state on error
    }
}

async function saveAttendanceState(state) {
    try {
        const attendanceRef = ref(database, 'attendance');
        await set(attendanceRef, {
            state: state,
            lastUpdated: new Date().toISOString()
        });
        console.log('State saved to Firebase');
    } catch (error) {
        console.error('Error saving to Firebase:', error);
    }
}

// --- Azure Function Entry Point ---

module.exports = async function (context, myTimer) {
    const timeStamp = new Date().toISOString();
    context.log('JavaScript timer trigger function ran!', timeStamp);

    try {
        // 1. Login to get a fresh session token
        const session = await login();

        // 2. Fetch courses
        const courses = await fetch_courses(session.auth_pref, session.token);
        
        // 3. Get previous state from Firebase
        const prevState = await getAttendanceState();
        const newState = {};

        // 4. Process each course and check for changes
        for (const c of courses) {
            const code = c.courseCode;
            const comp = c.studentCourseCompDetails[0];
            const present = comp.presentLecture;
            const total = comp.totalLecture;

            newState[code] = { present, total };

            const old = prevState[code] || { present: 0, total: 0 };
            if (old.present !== present || old.total !== total) {
                let status = "Unknown";
                if (total > old.total && present > old.present) {
                    status = "Present";
                } else if (total > old.total && present === old.present) {
                    status = "Absent";
                }
                
                context.log(`Change detected for ${code}: ${status}`);
                const msg = calculateAttendanceMessage(c.courseName, present, total, status);
                await send_telegram(msg);
            }
        }

        // 5. Save the new state to Firebase
        if (Object.keys(newState).length > 0) {
            await saveAttendanceState(newState);
        }

        context.log('Attendance check completed successfully.');

    } catch (error) {
        context.log.error('An error occurred during the attendance check:', error.message);
        // Optionally send an error notification via Telegram
        await send_telegram(`Attendance Bot Error: ${error.message}`);
    }
};

// --- Local Execution Block ---
// This allows running the script directly for testing (e.g., via `npm start`)
if (require.main === module) {
    console.log("Executing function for local testing...");

    // Mock the Azure Function context object
    const mockContext = {
        log: console.log,
        done: () => {
            console.log("Function execution complete.");
            // Disconnect from Firebase to allow the script to exit gracefully
            goOffline(database);
        }
    };
    // Add leveled logging to the mock context
    mockContext.log.error = console.error;
    mockContext.log.warn = console.warn;
    mockContext.log.info = console.info;
    mockContext.log.verbose = console.log;

    // Call the function
    module.exports(mockContext, null).then(() => {
        mockContext.done();
    }).catch(err => {
        console.error("Local execution failed:", err);
        goOffline(database); // Also disconnect on error
        process.exit(1);
    });
}
