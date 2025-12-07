# Backend Service - Cloud Notes API

Node.js/Express backend service for the Cloud Notes application.

## Features

- User authentication (JWT-based)
- CRUD operations for Notes
- Image upload to Amazon S3
- PostgreSQL database integration
- Secure API endpoints
- Docker support

## Quick Setup (Simple Steps)

**📖 For detailed step-by-step instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)**

### Quick Start:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file** (copy from template below)

3. **Set up PostgreSQL database:**
   - Create database named `cloud_notes`
   - Run: `psql -U postgres -d cloud_notes -f database/schema.sql`

4. **Start server:**
   ```bash
   npm run dev
   ```

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database (local or RDS)
- AWS account with S3 bucket (optional for local testing)

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (protected)

### Notes
- `GET /api/notes` - Get all notes (protected)
- `GET /api/notes/:id` - Get single note (protected)
- `POST /api/notes` - Create note (protected, supports image upload)
- `PUT /api/notes/:id` - Update note (protected, supports image upload)
- `DELETE /api/notes/:id` - Delete note (protected)

## Docker Deployment

Build image:
```bash
docker build -t cloud-notes-backend .
```

Run container:
```bash
docker run -p 5000:5000 --env-file .env cloud-notes-backend
```

## Environment Variables

See `.env.example` for all required environment variables.

