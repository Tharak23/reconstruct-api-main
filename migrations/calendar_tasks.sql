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