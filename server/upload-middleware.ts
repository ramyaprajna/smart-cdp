import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { secureLogger } from './utils/secure-logger';

// Ensure temp directory exists
const tempDir = path.join(process.cwd(), 'temp');
if (!existsSync(tempDir)) {
  mkdirSync(tempDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${sanitizedName}`);
  }
});

// File filter to allow specific file types
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv', // .csv
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/plain', // .txt
    'application/json' // .json
  ];

  const allowedExtensions = ['.xlsx', '.xls', '.csv', '.docx', '.txt', '.json'];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type. Allowed types: ${allowedExtensions.join(', ')}`));
  }
};

// Configure multer with limits for large files
export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 1 // Only one file at a time
  }
});

// Enhanced error handling middleware for file uploads
export const handleUploadErrors = (error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: 'File size must be less than 100MB',
          maxSize: '100MB'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Only one file can be uploaded at a time'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file field',
          message: 'File must be uploaded using the "file" field'
        });
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: error.message
        });
    }
  }

  if (error.message.includes('Unsupported file type')) {
    return res.status(400).json({
      error: 'Unsupported file type',
      message: error.message,
      supportedTypes: ['.xlsx', '.xls', '.csv', '.docx', '.txt', '.json']
    });
  }

  // Pass other errors to the next error handler
  next(error);
};

// Middleware to validate file upload
export const validateFileUpload = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No file uploaded',
      message: 'Please select a file to upload'
    });
  }

  // Additional validation
  const { file } = req;
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const supportedExtensions = ['.xlsx', '.xls', '.csv', '.docx', '.txt', '.json'];

  if (!supportedExtensions.includes(fileExtension)) {
    return res.status(400).json({
      error: 'Invalid file extension',
      message: `File extension ${fileExtension} is not supported`,
      supportedTypes: supportedExtensions
    });
  }

  // Check if file is empty
  if (file.size === 0) {
    return res.status(400).json({
      error: 'Empty file',
      message: 'The uploaded file is empty'
    });
  }

  next();
};

// Cleanup middleware to remove uploaded files after processing
export const cleanupUploadedFile = (filePath: string) => {
  try {
    import('node:fs').then((fs) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }).catch((error) => {
      secureLogger.error('Failed to cleanup uploaded file', { error: error instanceof Error ? error.message : String(error) }, 'UPLOAD_MIDDLEWARE');
    });
  } catch (error) {
    secureLogger.error('Failed to cleanup uploaded file', { error: error instanceof Error ? error.message : String(error) }, 'UPLOAD_MIDDLEWARE');
  }
};

// Helper function to get file info
export const getFileInfo = (file: Express.Multer.File) => {
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const fileType = getFileTypeFromExtension(fileExtension);

  return {
    originalName: file.originalname,
    fileName: file.filename,
    filePath: file.path,
    fileSize: file.size,
    fileType,
    extension: fileExtension,
    mimeType: file.mimetype,
    uploadedAt: new Date()
  };
};

const getFileTypeFromExtension = (extension: string): string => {
  switch (extension) {
    case '.xlsx':
    case '.xls':
      return 'excel';
    case '.csv':
      return 'csv';
    case '.docx':
      return 'docx';
    case '.txt':
      return 'txt';
    case '.json':
      return 'json';
    default:
      return 'unknown';
  }
};
