# Git Tracker Desktop App Backend

This project is the backend for a **Git Tracker Desktop Application Simulation**, built with TypeScript and Express.js. It acts as a local service on a developer's machine, responsible for finding, parsing, and saving Git repository data into a local **SQLite** database. It then orchestrates the synchronization of this data with a central **NestJS Backend API**.

This architecture is designed for an offline-first experience, where the desktop app can track commits even without an internet connection and sync them later.

---

## Core Architecture

This application follows a decoupled, two-part architecture:

1.  **Desktop App Backend (This Repository):**
    *   **Local-First:** Manages local Git repositories on the user's machine.
    *   **Data Extraction:** Uses `simple-git` to extract detailed commit history, including file stats and branch information.
    *   **Local Storage:** Stores all extracted data in a local **SQLite** database (`git-tracker.sqlite`).
    *   **Session Management:** Securely manages user authentication tokens in a separate `session.sqlite` database.
    *   **Smart Orchestrator:** Provides a local API for the desktop UI. It handles all logic for validating repositories, checking their status, and synchronizing unsynced commits with the remote backend.

2.  **NestJS Backend API (Separate Project):**
    *   **Central Source of Truth:** The main server that stores all user, project, and repository data in MongoDB.
    *   **Analytics Engine:** Receives commit data from desktop clients and pre-computes analytics (e.g., daily contribution counts) for fast dashboard performance.
    *   **Authentication:** Manages user registration and JWT-based authentication.

---

## Features

*   **Repository Management**:
    *   **Register:** Validates a local Git repository (checks for existence, valid `.git` folder, and initial commit) and registers it with the central backend.
    *   **Update:** Syncs repository detail changes (name, description) between the local app and the backend.
    *   **Status Check:** Periodically checks the file system status (`active`, `missing`, `moved`) of all local repositories and updates the backend.
*   **Commit Extraction & Syncing**:
    *   **Incremental Extraction:** Fetches only new commits since the last local sync (`lastSyncedAt`) for the configured Git author.
    *   **Detailed Parsing:** Extracts rich data for each commit, including parent hash, file changes (added/removed), and line-level stats.
    *   **Intelligent Branch Detection:** Iterates through local branches to assign the most relevant branch name to each commit.
    *   **Offline-First Sync:** Stores extracted commits locally with a `synced = 0` status, allowing the user to sync them to the backend later.
*   **Data Comparison & Views**:
    *   Provides endpoints to compare the local repository list against the remote backend to identify discrepancies.
    *   Generates a "consolidated view" that annotates each repository with its sync status (`synced`, `missing_local`, `missing_remote`).
*   **Professional Backend**:
    *   **Decoupled Architecture:** Clean separation between the orchestrating **Routes** and the pure business-logic **Services**.
    *   **Robust Error Handling:** Centralized error handling in each route for consistent and informative API responses.
    *   **Secure Session Management:** Handles JWT access and refresh tokens, storing them securely in a local `session.sqlite` database.

---

## Technologies Used

*   **Node.js** & **TypeScript**
*   **Express.js**
*   **SQLite** & **better-sqlite3** for local data persistence.
*   **simple-git** for powerful and safe interaction with Git.
*   **axios** for communication with the NestJS backend.
*   **dotenv** for environment variable management.
*   **winston** (optional, for advanced logging).

---

## Prerequisites

*   Node.js v16 or higher
*   Git installed on the system
*   pnpm package manager (`npm install -g pnpm`)
*   A running instance of the **NestJS Backend API**.

---

## Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Jaefer-Kemal/simple-git-express
    cd simple-git-express
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file in the root directory and set the URL for your NestJS backend:
    ```env
    BACKEND_API_URL=http://localhost:3001/api
    ```

4.  **Run the application:**
    For development with hot-reloading:
    ```bash
    pnpm start
    ```
    For a production build:
    ```bash
    pnpm build
    pnpm serve
    ```
    The server will start, typically on port 5000, and will create `git-tracker.sqlite` and `session.sqlite` files in the root directory.

---

## Project Structure

```
your-repo-name/
├── src/
│   ├── routes/              # Express routers (the "Orchestrators")
│   ├── services/            # Pure business logic classes (the "Workers")
│   ├── controllers/         # (Optional) Controller functions used by routes
│   ├── config/              # Database configurations (git.db.ts, session.db.ts)
│   ├── jobs/                # Background schedulers (scheduler.ts)
│   ├── middleware/          # Express middleware (error.middleware.ts)
│   ├── utils/               # Shared utilities (logger.ts, checkSession.ts)
│   └── app.ts               # Express application entry point
├── .env                    # Environment variables
├── tsconfig.json           # TypeScript configuration
└── package.json            # Project dependencies and scripts
```

---

## API Endpoints

All endpoints are prefixed with `/api/git`.

| Method | Endpoint                                 | Description                                                                   |
| :----- | :--------------------------------------- | :---------------------------------------------------------------------------- |
| POST   | `/register-repo`                         | Validates and registers a new local repository with the backend.              |
| PATCH  | `/update-repo/:repoId`                   | Updates a repository's name/description on the backend and locally.           |
| GET    | `/repositories/status-check`             | Checks the status of all local repos and syncs their status to the backend.   |
| GET    | `/compare-repos`                         | Compares local and remote repository lists and returns the differences.       |
| GET    | `/get-repo`                              | Provides a consolidated, annotated view of all repositories.                  |
| GET    | `/extract-new-commits/:repoId`           | Extracts new commits from a repo and saves them to the local SQLite DB.       |
| POST   | `/sync-unsynced-commits/:repoId`         | Sends all unsynced commits from the local DB to the NestJS backend.           |

---

## How the Sync Process Works

1.  **Extraction:** The user triggers the `GET /extract-new-commits/:repoId` endpoint. The service fetches all new commits since `lastSyncedAt`, parses them, and saves them to the local `git_commits` table with `synced = 0`. It then updates the `repositories.lastSyncedAt` timestamp.
2.  **Synchronization:** The user triggers the `POST /sync-unsynced-commits/:repoId` endpoint.
    *   The service fetches all commits where `synced = 0`.
    *   It sends this data to the NestJS backend.
    *   If the backend responds with success, the service updates the local commits to `synced = 1`.

This ensures data is never lost, even if the user works offline for extended periods.