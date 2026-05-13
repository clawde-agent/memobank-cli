/**
 * Onboarding command (memo init)
 * 4-step interactive TUI setup wizard using Ink
 *
 * ink, ink-text-input, and ink-select-input are ESM-only packages that cannot be
 * require()'d from a CommonJS bundle. All imports of those packages are done via
 * a Function-constructor-based dynamic import() so TypeScript does not rewrite
 * them to require() calls.
 */
export declare function onboardingCommand(): Promise<void>;
//# sourceMappingURL=onboarding.d.ts.map