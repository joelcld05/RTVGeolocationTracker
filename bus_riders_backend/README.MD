# Crowmie API

A robust API service for Crowmie's renewable energy platform, providing additional functionality and integrations.

## 🚀 Features

- RESTful API endpoints
- WebSocket support for real-time communication
- Authentication and authorization
- File upload and processing
- Email notifications
- Blockchain integration
- Document generation
- Rate limiting and security features

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Language**: TypeScript
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: Passport.js, JWT
- **Real-time**: Socket.IO
- **Testing**: Jest
- **Documentation**: API documentation (to be added)
- **Containerization**: Docker

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Docker (optional)
- AWS S3 (for file storage)
- SMTP server (for email notifications)

## 🔧 Installation

1. Clone the repository:

```bash
git clone [repository-url]
cd crowmie_api
```

2. Install dependencies:

```bash
npm install
```

3. Create environment files:

- `.env.dev` for development
- `.env.test` for testing
- `.env.prod` for production

4. Build the project:

```bash
npm run build
```

## 🏃‍♂️ Running the Application

### Development

```bash
npm run dev
```

### Production

```bash
npm run prod
```

### Testing

```bash
npm test
```

### Docker

```bash
# Development
docker-compose up

# Production
docker build -t crowmie-api .
docker run -p 3000:3000 crowmie-api
```

## 📁 Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── libs/          # Third-party library configurations
├── middleware/    # Custom middleware
├── models/        # Database models
├── services/      # Business logic
├── test/          # Test files
├── utils/         # Utility functions
├── views/         # Template files
├── app.ts         # Express application setup
├── server.ts      # Server entry point
└── socket.ts      # WebSocket configuration
```

## 🔐 Environment Variables

Create the following environment files based on your environment:

- `.env.dev` for development
- `.env.test` for testing
- `.env.prod` for production

Required environment variables:

```

```

Note: Never commit environment files to version control. Keep a `.env.example` file in the repository as a template.

## 📝 API Documentation

API documentation will be available at `/api-docs` when running the server.

## 🔒 Security

- Helmet.js for security headers
- Rate limiting
- CORS configuration
- Input validation
- JWT authentication
- Password hashing with bcrypt

## 🧪 Testing

The project uses Jest for testing. Run tests with:

```bash
npm test
```

## 📦 Scripts

- `npm start`: Start the production server
- `npm run dev`: Start development server with hot reload
- `npm run build`: Build TypeScript files
- `npm run test`: Run tests
- `npm run lint`: Run ESLint
- `npm run format`: Format code with Prettier

## 📄 License

This project is licensed under the ISC License.

## 👥 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📧 Support

For support, please contact Crowmie Renovable S.L.
