# Firebase Setup Instructions

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard

## Step 2: Enable Authentication

1. In Firebase Console, go to **Authentication** → **Get Started**
2. Click **Sign-in method** tab
3. Enable **Email/Password** provider
4. Click **Save**

## Step 3: Enable Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location (choose closest to your users)
5. Click **Enable**

### Security Rules (Important!)

After setup, update your Firestore security rules:

1. Go to **Firestore Database** → **Rules**
2. Replace the rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Click **Publish**

## Step 4: Get Your Firebase Config

1. In Firebase Console, click the gear icon ⚙️ → **Project settings**
2. Scroll down to **Your apps** section
3. Click the **Web** icon (`</>`) to add a web app
4. Register your app (give it a nickname)
5. Copy the `firebaseConfig` object

## Step 5: Update Your Code

Open `index.html` and find this section:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

Replace it with your actual Firebase config values.

## Step 6: Deploy

1. Commit your changes
2. Push to your repository
3. Vercel will automatically redeploy

## How It Works

- **Sign Up**: Creates a new account and saves your current data to the cloud
- **Sign In**: Loads your data from the cloud (overwrites local data)
- **Auto-sync**: Automatically saves changes every 30 seconds when signed in
- **Offline**: Works offline, syncs when connection is restored
- **Multi-device**: Sign in on any device to access your data

## Testing

1. Sign up with a test email
2. Add some budget data
3. Sign out
4. Sign in again - your data should be there!
5. Open the app on another device/browser and sign in - data should sync!

## Troubleshooting

- **404 errors**: Make sure Firestore is enabled and rules are published
- **Auth errors**: Make sure Email/Password auth is enabled
- **Sync not working**: Check browser console for errors
- **Data not syncing**: Verify Firebase config is correct
