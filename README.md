# Git Manager API

A TypeScript-based Express.js backend for managing Git repositories and tracking commit data, integrated with MongoDB. The API allows users to register Git repositories, check their status, and fetch/store commit data from all branches or a specific branch, with incremental syncing using a `lastSyncedAt` timestamp. Designed for testing via Postman, it includes professional features like input validation, error handling, and logging.

---

## Features

* **Repository Management**:

  * Register Git repositories with name, description, path, and permission (`read` or `read-write`).
  * Update, delete, and list repositories.
  * Check repository status (`active`, `missing`, `moved`, or `deleted`) based on file system and Git validity.
* **Commit Tracking**:

  * Fetch commits from all branches by default, or a specific branch if provided.
  * Store commit details (hash, message, date, files changed, insertions, deletions, branch, file names, pull count).
  * Retrieve commits stored in the database.
* **Branch Listing**:

  * Get all branches of a repository.
* **Incremental Syncing**:

  * Fetch all commits on first sync; subsequent syncs fetch only new commits since `lastSyncedAt`.
* **Professional Backend**:

  * Input validation using `zod`.
  * Robust error handling with a global error handler.
  * Logging with `winston` for debugging and error tracking.
  * Type-safe TypeScript codebase with MongoDB integration via Mongoose.

---

## Technologies

* **Node.js** & **TypeScript**
* **Express.js**
* **MongoDB** & **Mongoose**
* **simple-git**
* **zod**
* **winston**
* **dotenv**

---

## Prerequisites

* Node.js v16 or higher
* MongoDB running locally or accessible remotely
* Git installed on the system
* pnpm package manager (`npm install -g pnpm`)
* Postman (optional) for API testing

---

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Jaefer-Kemal/simple-git-express
   cd simple-git-express
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create `.env` file in the root directory:

   ```env
   MONGODB_URI=mongodb://localhost:27017/gitdb
   PORT=3000
   ```

4. Start MongoDB server:

   ```bash
   mongod
   ```

5. Build and run the app:

   ```bash
   pnpm build
   pnpm serve
   ```

   Or for development with hot-reloading:

   ```bash
   pnpm start
   ```

---

## Project Structure

```
git-manager-api/
├── src/
│   ├── models/              # Mongoose schemas (RepositoryModel, GitDataModel)
│   ├── routes/              # API routes (git.ts)
│   ├── services/            # Business logic and Git operations (gitServices.ts)
│   ├── middleware/          # Error handling (errorHandler.ts)
│   ├── utils/               # Logger config (logger.ts)
│   └── app.ts               # Express app initialization
├── .env                    # Environment variables
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

---

## API Endpoints

All endpoints are prefixed with `/api/git`.

### Repository Management

| Method | Endpoint                   | Description               |
| ------ | -------------------------- | ------------------------- |
| POST   | `/repositories`            | Register a new repository |
| GET    | `/repositories`            | List all repositories     |
| GET    | `/repositories/:id/status` | Check repository status   |
| PUT    | `/repositories/:id`        | Update repository details |
| DELETE | `/repositories/:id`        | Delete a repository       |

### Commit and Branch Operations

| Method | Endpoint                            | Description                                   |
| ------ | ----------------------------------- | --------------------------------------------- |
| GET    | `/repositories/:id/commits`         | Fetch commits from all branches               |
| GET    | `/repositories/:id/commits/*branch` | Fetch commits for a specific branch           |
| GET    | `/repositories/:id/db-commits`      | Get all commits stored in DB for a repository |
| GET    | `/repositories/:id/branches`        | List all branches of a repository             |

---

## Example: Register Repository

**POST** `/repositories`

Request Body:

```json
{
  "name": "TestRepo",
  "description": "A test repository",
  "path": "/path/to/repo",
  "permission": "read-write"
}
```

Successful Response (201):

```json
{
  "_id": "507f1f77bcf86cd799439011",
  "name": "TestRepo",
  "description": "A test repository",
  "path": "/path/to/repo",
  "status": "active",
  "permission": "read-write",
  "createdAt": "2025-07-18T17:10:00.000Z",
  "updatedAt": "2025-07-18T17:10:00.000Z"
}
```

---

## Notes

* Use MongoDB `_id` values for repository `:id` parameters.
* Branch names in `/repositories/:id/commits/*branch` support slashes (e.g., `remotes/origin/main`).
* Validation errors return 400 with detailed messages.
* Server errors return 500 with logged details.
* Commit fetching endpoints support incremental syncing with `lastSyncedAt`.

---

## Testing with Postman

1. Create a new collection named **Git Manager API**.
2. Set the base URL: `http://localhost:3000/api/git`.
3. Test endpoints as described above, replacing `<repo-id>` with actual MongoDB ObjectId.
4. Ensure `/path/to/repo` is a valid Git repository path on your system.

---

## Logging

* Logs saved to:

  * `logs/combined.log` — all logs (info, debug, error)
  * `logs/error.log` — error logs only
* Console output enabled for real-time monitoring

---

## Error Handling

* **400 Bad Request** for validation failures with error messages.
* **404 Not Found** if requested data does not exist.
* **500 Internal Server Error** for unexpected issues, with error details logged.

---

## Extending the Application

* Add pagination query parameters to list endpoints.
* Integrate JWT authentication middleware.
* Use Git hosting APIs (e.g., GitHub API) to track pull requests.
* Replace `simple-git` with custom Git commands using `child_process`.

---

## Contributing

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add your feature'`).
4. Push the branch (`git push origin feature/your-feature`).
5. Open a pull request.

---

## License

MIT License

---