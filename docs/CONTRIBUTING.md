# Contributing to Shiori

First off, thank you for considering contributing to Shiori! It's people like you that make this application a great local-first reading platform.

## Code of Conduct
By participating in this project, you are expected to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs
This section guides you through submitting a bug report for Shiori. Following these guidelines helps maintainers and the community understand your report, reproduce the behavior, and find related reports.
* Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template.
* Check if the issue has already been reported.
* Include detailed steps to reproduce, what you expected to see, and what actually happened.

### Suggesting Enhancements
This section guides you through submitting an enhancement suggestion for Shiori, including completely new features and minor improvements to existing functionality.
* Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template.
* Provide a clear and descriptive title.
* Explain why this enhancement would be useful to most Shiori users.

### Pull Requests
The process described here has several goals:
* Maintain Shiori's quality
* Fix problems that are important to users
* Engage the community in working toward the best possible Shiori

Please follow these steps:
1. Fork the repository and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. Ensure the test suite passes (`npm run lint` and `npm run build`).
4. Make sure your code follows the existing formatting guidelines.
5. Create the PR using the [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).

## Development Setup

### Prerequisites
* Node.js 18+
* Rust stable toolchain
* Platform build dependencies for Tauri

### Steps
1. Clone your fork: `git clone https://github.com/vinayydv3695/Shiori.git`
2. Install dependencies: `npm install`
3. Run the development server: `npm run dev`

### Project Structure
* `/src` - React frontend code.
* `/src-tauri` - Rust backend code.
* `/assets` - Media and static assets used in documentation.

Thank you for contributing!
