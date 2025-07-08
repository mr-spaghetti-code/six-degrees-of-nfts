# Contributing to six-degrees.art

First off, thank you for considering contributing to six-degrees.art! It's people like you that make six-degrees.art such a great tool for the NFT community.

## 🤝 Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on what is best for the community
- Show empathy towards other community members

## 🐛 Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

### Bug Report Template

```markdown
**Description**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. macOS]
 - Browser: [e.g. Chrome, Safari]
 - Node version: [e.g. 18.0.0]
```

## 💡 Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, include:

- A clear and descriptive title
- A detailed description of the proposed enhancement
- Examples of how the enhancement would be used
- Any relevant mockups or diagrams

## 🔧 Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/yourusername/nft-discover.git
   cd nft-discover
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.example .env.local
   # Edit .env.local with your API keys
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

## 📝 Pull Request Process

1. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Add comments for complex logic
   - Update documentation as needed

3. **Test your changes**
   - Ensure the app builds without errors: `npm run build`
   - Test the functionality in different scenarios
   - Check for console errors

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat: add amazing feature"
   ```
   
   Follow conventional commit format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `style:` for formatting changes
   - `refactor:` for code refactoring
   - `test:` for adding tests
   - `chore:` for maintenance tasks

5. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Use a clear and descriptive title
   - Link any related issues
   - Provide a detailed description of changes
   - Include screenshots for UI changes

## 🎨 Style Guidelines

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow ESLint configuration
- Use meaningful variable and function names
- Add JSDoc comments for complex functions

```typescript
/**
 * Loads NFT collectors for a specific token
 * @param contract - The NFT contract address
 * @param tokenId - The token ID to fetch collectors for
 * @returns Array of collector addresses
 */
async function loadCollectors(contract: string, tokenId: string): Promise<string[]> {
  // Implementation
}
```

### React Components

- Use functional components with hooks
- Keep components focused and small
- Extract reusable logic into custom hooks
- Use proper TypeScript types for props

```typescript
interface NFTCardProps {
  nft: NFTData;
  onExpand?: () => void;
  className?: string;
}

export function NFTCard({ nft, onExpand, className }: NFTCardProps) {
  // Component implementation
}
```

### CSS/Styling

- Use Tailwind CSS utility classes
- Follow the existing design system
- Ensure responsive design
- Test on different screen sizes

## 🧪 Testing

While we don't have automated tests yet, please manually test:

- Different wallet addresses
- Various NFT collections
- Different screen sizes
- Both 3D and 2D modes
- All interactive features

## 📚 Documentation

- Update README.md if you change setup steps
- Document new environment variables
- Add comments for complex algorithms
- Update API documentation for new endpoints

## 🚀 Release Process

Maintainers will handle releases, but for reference:

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a GitHub release
4. Deploy to production

## 💬 Getting Help

- Check existing [issues](https://github.com/yourusername/nft-discover/issues)
- Join our [Discord community](https://discord.gg/nftdiscover)
- Reach out to maintainers

## 🙏 Recognition

Contributors will be recognized in:
- The README.md file
- GitHub contributors page
- Release notes

Thank you for contributing to six-degrees.art! 🎨✨ 