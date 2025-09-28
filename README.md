# Azure Function Cyber Vidya

An Azure Function to check and report Cyber Vidhya attendance.

## About the Repo

This repository contains the source code for an Azure Function that automates the process of checking and reporting attendance for Cyber Vidhya. It utilizes Node.js and integrates with Firebase for data storage and Axios for making HTTP requests.

## Setup and Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Harshit-Patel01/Azure-Function-Cyber-Vidya.git
    cd Azure-Function-Cyber-Vidya
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create a `.env` file** in the root of the project and add the necessary environment variables. You will need to add your Firebase configuration details here.
    ```
    FIREBASE_API_KEY=your_api_key
    FIREBASE_AUTH_DOMAIN=your_auth_domain
    FIREBASE_PROJECT_ID=your_project_id
    FIREBASE_STORAGE_BUCKET=your_storage_bucket
    FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    FIREBASE_APP_ID=your_app_id
    ```

## Running the Function

To run the function locally, use the following command:

```bash
npm start
```

This will start the Node.js application and execute the `index.js` file.
