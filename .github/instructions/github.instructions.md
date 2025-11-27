---
applyTo: '**'
---

# Project Instructions for AI Assistants

## Code Generation Guidelines

When generating code, answering questions, or reviewing changes, follow these guidelines:

### Documentation Policy

**DO NOT create documentation files.** This includes:
- ❌ No markdown documentation files (`.md` files in `/docs`)
- ❌ No implementation summaries
- ❌ No quick reference guides
- ❌ No architecture diagrams in markdown
- ❌ No migration guides
- ❌ No changelog files

**Focus on code only:**
- ✅ Write clean, self-documenting code
- ✅ Add inline comments where necessary
- ✅ Use descriptive variable and function names
- ✅ Include JSDoc comments for functions and classes
- ✅ Provide brief explanations in conversation when needed

### Code Quality Standards

1. **TypeScript Best Practices**
   - Use strict typing
   - Avoid `any` types when possible
   - Export types and interfaces appropriately

2. **Code Organization**
   - Follow existing project structure
   - Keep files focused and single-purpose
   - Use proper imports and exports

3. **Comments**
   - Add comments for complex logic
   - Use JSDoc for public APIs
   - Keep comments concise and relevant

4. **Testing**
   - Provide test examples in conversation if asked
   - Don't create test files unless explicitly requested

### Response Format

When implementing features:
1. Create/modify only the necessary code files
2. Explain the implementation briefly in the conversation
3. DO NOT create separate documentation files
4. Provide usage examples inline in conversation if needed
