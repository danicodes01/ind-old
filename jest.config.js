/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  collectCoverageFrom: ['src/domain/**/*.ts', '!src/domain/**/*.test.ts', '!src/**/index.ts'],
  // The domain layer holds the money and time arithmetic. It is the one place where a gap in
  // coverage is a gap in something someone gets paid on, so it is held to a hard threshold.
  coverageThreshold: {
    'src/domain/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
  },
};
