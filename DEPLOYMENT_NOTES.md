# Calendar API Deployment Notes

## 1. Database Changes

Execute the following SQL migration script to create the required table:

```sql
-- Calendar Tasks Table
CREATE TABLE IF NOT EXISTS calendar_2025_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  task_date DATE NOT NULL,
  task_type INT NOT NULL,
  task_description TEXT NOT NULL,
  color_code VARCHAR(20) NOT NULL,
  theme VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_email (user_name, email),
  INDEX idx_task_date (task_date),
  INDEX idx_theme (theme)
);
```

## 2. API Changes

We've added two new endpoints to the server.js file:

1. **GET /api/calendar/load** - Loads calendar tasks for a user and theme
2. **POST /api/calendar/save** - Saves a calendar task with date, type, description, and color code

These endpoints follow the same authentication pattern as the existing task endpoints.

## 3. Testing

After deployment, test the endpoints using:

```bash
# Test script
node test_api.js

# Or directly with curl
curl -X GET "https://reconstrect-api.onrender.com/health"

# Save a calendar task
curl -X POST "https://reconstrect-api.onrender.com/api/calendar/save" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer testuser:test@example.com" \
  -d '{
    "user_name": "testuser",
    "email": "test@example.com",
    "task_date": "2025-05-15",
    "task_type": 1,
    "task_description": "API Test Task via Curl",
    "color_code": "#ff6f61",
    "theme": "AnimalTheme",
    "table": "calendar_2025_tasks"
  }'

# Load calendar tasks
curl -X GET "https://reconstrect-api.onrender.com/api/calendar/load?theme=AnimalTheme" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer testuser:test@example.com"
```

## 4. Deployment Steps

1. Update the server.js file with the new endpoints
2. Run the SQL migration script on the database
3. Restart the server
4. Test the new endpoints 