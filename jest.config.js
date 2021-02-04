module.exports = {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "collectCoverageFrom": [
        "**/src/**/*.{ts,tsx,js,jsx}",
        "**/test/**/*.{ts,tsx,js,jsx}"
    ],
    "coverageDirectory": "./coverage",
    "coveragePathIgnorePatterns": [
        "coverage/",
        "node_modules/",
        "public/",
        "esm/",
        "lib/",
        "tmp/",
        "dist/"
    ],
    "testPathIgnorePatterns": [
        "<rootDir>/lib",
        "/node_modules/"
    ],
    "coverageReporters": [
        "lcov",
        "json-summary",
        "html",
        "text"
    ],
    "coverageThreshold": {
        "global": {
            "branches": 75,
            "functions": 75,
            "lines": 75,
            "statements": 75
        }
    }
};
