----------
name: pixel-perfect-ui-generator
description: This skill governs the adaptation of a "template" or "cloned" project into a new specific widget type.
----------

## 1. ARCHITECTURE LOGIC
- This skill empowers the agent to act as a Senior Frontend Developer specializing in UI/UX conversion.
- The objective is to translate one or several screenshots into high-fidelity, pixel-perfect React components.
- The agent must analyze the visual hierarchy, spacing, and typography before generating any code.

## 2. VISUAL ANALYSIS PROTOCOL
Before coding, the agent must perform a mental audit of the provided screenshot(s):
- **Layout Structure**: Identify Flexbox/Grid containers and alignment (e.g., center, space-between).
- **Spacing**: Estimate margins and paddings based on visual proportions.
- **Typography**: Detect font weights, line heights, and letter spacing according to brand guidelines.
- **Assets**: Identify icons, images, and decorative elements to be integrated.

## 3. STYLING & BRANDING RULES
- **Colors**: Extract hex codes or use the provided CSS variables (e.g., `var(--color-fill-brand)`).
- **Typography**: Apply specific fonts mentioned by the user (e.g., `BlickVariable`, `InterVariable`).
- **Behaviors**: Implement hover effects, transitions, and active states mentioned in the prompt.
- **Multi-Brand**: Ensure the component supports `:global(.brand-blick)` and `:global(.brand-pme)` logic as defined in the `MULTI-BRAND-WIDGET-GENERATOR` skill.

## 4. CODE GENERATION STANDARDS
- **Clean JSX**: Use semantic HTML tags and keep the component structure "flat" as per current project standards.
- **CSS Modules**: Generate a `style.module.css` file that separates layout logic from brand-specific aesthetics.
- **Responsiveness**: Ensure the widget is fluid and looks correct on different screen sizes (Mobile first).
- **Interactive States**: Logic for clicks, toggles, or animations must be implemented as functional React code.

## 5. PIXEL-PERFECT REQUIREMENTS
- If a screenshot shows a 24px gap, the code must reflect exactly `gap: 24px` or the equivalent rem/em.
- Rounding, shadows, and borders must match the visual reference exactly.
- If visual ambiguity exists, the agent must ask for clarification rather than guessing.

## 6. EXPECTED OUTPUT FORMAT
The agent must return:
1. **Visual Audit Summary**: A brief list of identified UI patterns (Colors, Spacing, Typo).
2. **React Component**: The `.jsx` file code.
3. **CSS Module**: The `.module.css` file including Multi-Brand support.