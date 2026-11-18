module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Generous: the first render test in a suite pays for cold transforms.
  testTimeout: 30000,
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/helpers/'],
};
