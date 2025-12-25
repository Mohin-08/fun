# Complaint Analyzer

An AI-powered complaint management system built with React, Firebase, and Google Gemini API.

## Features

- User authentication and role-based access (Admin, Manager, User)
- AI-powered complaint analysis using Google Gemini API
- Real-time complaint tracking and workflow management
- Dashboard with analytics and insights
- Firebase Realtime Database integration

## Tech Stack

- React + Vite
- Firebase (Authentication, Realtime Database, Cloud Functions)
- Google Gemini API for AI analysis
- Chart.js for analytics visualization

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Firebase in `src/firebase/firebase.js`

3. Deploy Firebase Functions:
```bash
cd functions
npm install
firebase deploy --only functions
```

## License

MIT
