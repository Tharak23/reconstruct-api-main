# Reconstrect API

Node.js backend API for the Reconstrect Flutter application.

## Tech Stack

- Node.js
- Express.js
- MySQL (GoDaddy Hosted)
- JWT Authentication
- CORS enabled

## Prerequisites

- Node.js >= 18.0.0
- MySQL Server (GoDaddy Hosted)
- npm or yarn

## Local Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/dhanushyangal/reconstrect-api.git
   cd reconstrect-api
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=3000

   # MySQL Database Configuration (GoDaddy)
   DB_HOST=sg2plzcpnl508506.prod.sin2.secureserver.net
   DB_USER=reconstructblog
   DB_PASSWORD=reconstructblog123!
   DB_NAME=reconstruct
   DB_PORT=3306

   # JWT Secret
   JWT_SECRET=your_jwt_secret_key

   # CORS Configuration
   CORS_ORIGIN=*

   # Node Environment
   NODE_ENV=development
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /auth/register` - Register a new user
- `POST /auth/login` - Login with email and password
- `POST /auth/google` - Login with Google
- `GET /auth/profile` - Get user profile (requires authentication)

### Health Checks
- `GET /health` - Check API health
- `GET /db-test` - Test database connection
- `GET /table-info` - Get database table structure

### Vision Board Tasks

The API now supports the following endpoints for managing vision board tasks:

#### GET /vision-board/tasks

Retrieves vision board tasks for a specific category.

Query Parameters:
- `category` (required): The vision board category (e.g., "Travel", "Health")
- `user_id` (optional): User ID for authenticated users
- `theme` (optional): The theme of the vision board (e.g., "post_it", "winter_warmth")

Example Response:
```json
{
  "tasks": [
    {
      "id": 1,
      "user_id": "123",
      "user_name": "John Doe",
      "email": "john@example.com",
      "card_id": "Travel",
      "tasks": [
        {"text": "Visit Paris", "completed": false, "id": "1741804431385"},
        {"text": "Road trip across USA", "completed": true, "id": "1741804432289"}
      ],
      "theme": "post_it",
      "created_at": "2025-03-13 00:03:51",
      "updated_at": "2025-03-13 00:03:52"
    }
  ]
}
```

#### POST /vision-board/tasks

Create or update vision board tasks for a category.

Request Body:
```json
{
  "card_id": "Travel",
  "tasks": [
    {"text": "Visit Paris", "completed": false, "id": "1741804431385"},
    {"text": "Road trip across USA", "completed": true, "id": "1741804432289"}
  ],
  "theme": "post_it",
  "user_id": "123" // Optional, uses authenticated user if available
}
```

Response:
```json
{
  "message": "Vision board tasks created successfully",
  "card_id": "Travel"
}
```

#### PUT /vision-board/tasks/:taskId

Update a specific task within a category.

Request Body:
```json
{
  "text": "Visit Tokyo",
  "completed": true,
  "card_id": "Travel",
  "theme": "post_it",
  "user_id": "123" // Optional, uses authenticated user if available
}
```

Response:
```json
{
  "message": "Task updated successfully",
  "card_id": "Travel",
  "taskId": "1741804431385"
}
```

#### DELETE /vision-board/tasks/:taskId

Delete a specific task.

Query Parameters:
- `user_id` (optional): User ID for authenticated users

Response:
```json
{
  "message": "Task deleted successfully",
  "card_id": "Travel",
  "taskId": "1741804431385"
}
```

## Database Schema

The API expects a MySQL database with the following table:

```sql
CREATE TABLE user (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  firebase_uid VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## GoDaddy MySQL Connection Notes

1. The database is hosted on GoDaddy's server at:
   - Host: sg2plzcpnl508506.prod.sin2.secureserver.net
   - Port: 3306

2. Make sure to:
   - Allow remote connections from Render's IP addresses in GoDaddy's MySQL configuration
   - Use SSL/TLS for secure database connections
   - Keep database credentials secure and never commit them to Git

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the ISC License.

## Support

For support, email your-email@example.com or create an issue in the GitHub repository.

## Database Setup

To set up the vision board tasks table in your database, run the SQL commands in `config/schema.sql`:

```sql
-- Vision Board Tasks Table
CREATE TABLE IF NOT EXISTS `vision_board_tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` VARCHAR(255),
  `user_name` VARCHAR(255),
  `email` VARCHAR(255),
  `card_id` VARCHAR(255) NOT NULL,
  `tasks` JSON NOT NULL,
  `theme` VARCHAR(255) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `user_id_index` (`user_id`),
  INDEX `card_id_index` (`card_id`),
  INDEX `theme_index` (`theme`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```
