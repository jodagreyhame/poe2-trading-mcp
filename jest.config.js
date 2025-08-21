/**
 * Jest Configuration for POE2Scout MCP Server Testing
 * 
 * Comprehensive test setup supporting unit, integration, and performance tests
 * with proper TypeScript handling and test organization.
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // TypeScript support
  preset: 'ts-jest',
  extensionsToTreatAsEsm: ['.ts'],

  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.ts',
    '<rootDir>/tests/**/*.spec.ts'
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],

  // Coverage configuration
  collectCoverage: false, // Enable only when needed
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'esnext',
        moduleResolution: 'node'
      }
    }]
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Transform ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ]
};