# Telegram Bot Revamp Documentation

This document outlines the changes and new features implemented in the Telegram bot for the Clanker MiniApp.

## 🚀 Overview

The Telegram bot has been revamped to provide a modern, interactive experience leveraging the latest Telegram UI features. It serves as the primary entry point for both Admins and Regular Users.

## 🛠 Admin Features

### 🎮 Admin Command Center
When an admin sends `/start`, they are greeted with a rich, interactive dashboard:
- **Environment Status**: Live indicators of system health.
- **Quick Actions**:
    - **Launch Terminal**: Direct link to the Web App.
    - **Generate Access**: Create one-time invite codes via `/invite`.
    - **Analytics**: (Coming soon) Quick view of deployment stats.

### 🔑 Access Management
- **One-Time Invite Codes**: Admins can generate unique codes using `/invite [label]`.
- **Labeling**: Codes can be labeled for tracking (e.g., `/invite FriendName`).
- **Expiry**: Codes automatically expire after 24 hours if unused, or immediately upon first use.

### ⚙️ Quick Settings
- **Session Management**: Reset all active sessions directly from the bot.
- **Template Editing**: Quick access to default deployment templates.

## 👥 User Experience

### 🔒 Access Gating
- Users without a valid session or invite code are elegantly restricted.
- Clear instructions and action buttons to enter an access code.

### 📱 Modern UI Elements
- **Web App Buttons**: Prominent buttons to transition into the MiniApp.
- **Rich Formatting**: HTML-styled messages for better readability.
- **Haptic Feedback**: Integrated via the WebApp SDK for a premium feel.

## 🔧 Technical Details

- **Webhook Architecture**: Optimized for Cloudflare Pages (Serverless) execution.
- **Security**: Verified Telegram User IDs for all admin actions.
- **State Management**: Integrated with Turso Database for session and invite code persistence.

## 📜 Available Commands

| Command | Role | Description |
|---------|------|-------------|
| `/start` | All | Launch the MiniApp or check status |
| `/help` | All | Show context-aware help message |
| `/invite` | Admin | Generate a one-time access code |
| `/settings` | Admin | Quick bot configuration |
| `/id` | All | Get your Telegram User ID |
