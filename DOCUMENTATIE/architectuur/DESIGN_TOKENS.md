# Design Tokens Reference

Complete reference guide for all design tokens used in the Minivoetbal Harelbeke application.

## Colors

### Primary Palette
```css
--color-primary-base: #60368c;      /* Main brand color */
--color-primary-light: #ab86dd;     /* Light accent */
--color-white: #ffffff;             /* Pure white */
```

### Color Scale (50-900)
```css
--color-50: #faf8ff;   /* Lightest */
--color-100: #f5f0ff;
--color-200: #e9e0ff;
--color-300: #d4c0ff;
--color-400: #ab86dd;  /* Primary light */
--color-500: #8c5dc0;
--color-600: #60368c;  /* Primary base */
--color-700: #4a2a6b;
--color-800: #351d4a;
--color-900: #201029;  /* Darkest */
```

### Semantic Colors
```css
/* Destructive (Red) */
--color-destructive: #ef4444;
--color-destructive-light: var(--color-white);
--color-destructive-dark: #dc2626;
--color-destructive-border: #f87171;

/* Success (Green) */
--color-success: #22c55e;
--color-success-light: var(--color-white);
--color-success-dark: #15803d;

/* Disabled States */
--color-disabled-bg: var(--color-100);
--color-disabled-text: var(--color-400);
--color-disabled-border: var(--color-200);
```

### Shadow Colors
```css
--color-shadow-primary-04: rgba(96, 54, 140, 0.04);
--color-shadow-primary-07: rgba(96, 54, 140, 0.07);
--color-shadow-primary-09: rgba(96, 54, 140, 0.09);
--color-shadow-primary-10: rgba(96, 54, 140, 0.10);
--color-shadow-primary-12: rgba(96, 54, 140, 0.12);
--color-shadow-primary-15: rgba(96, 54, 140, 0.15);
--color-shadow-primary-18: rgba(96, 54, 140, 0.18);
--color-shadow-primary-25: rgba(96, 54, 140, 0.25);
```

## Typography

### Font Families
```css
--font-body: 'Inter', system-ui, -apple-system, sans-serif;
--font-heading: 'Inter', system-ui, -apple-system, sans-serif;
```

### Font Weights
```css
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

### Line Heights
```css
--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.6;
--line-height-loose: 1.8;
--line-height-body: var(--line-height-relaxed);
--line-height-title: var(--line-height-tight);
```

### Letter Spacing
```css
--letter-spacing-tight: -0.025em;
--letter-spacing-normal: 0;
--letter-spacing-wide: 0.025em;
--letter-spacing-wider: 0.05em;
```

### Fluid Font Sizes (Tailwind)
- `text-xs`: `clamp(0.75rem, 0.5vw + 0.65rem, 0.875rem)`
- `text-sm`: `clamp(0.875rem, 0.7vw + 0.75rem, 1rem)`
- `text-base`: `clamp(1rem, 1vw + 0.875rem, 1.125rem)`
- `text-lg`: `clamp(1.125rem, 1.2vw + 1rem, 1.25rem)`
- `text-xl`: `clamp(1.25rem, 1.5vw + 1.125rem, 1.5rem)`
- `text-2xl`: `clamp(1.5rem, 2vw + 1.25rem, 2rem)`
- `text-3xl`: `clamp(1.875rem, 2.5vw + 1.5rem, 2.5rem)`

## Spacing

### Standard Spacing Scale (Tailwind)
- `0`: 0
- `0.5`: 0.125rem (2px)
- `1`: 0.25rem (4px)
- `2`: 0.5rem (8px)
- `3`: 0.75rem (12px)
- `4`: 1rem (16px)
- `6`: 1.5rem (24px)
- `8`: 2rem (32px)

### Component-Specific Padding
```css
/* Cards */
.card { padding: 1.5rem; }
.card-header { padding: 1rem 1.5rem; }

/* Buttons */
.btn { padding: 0.5rem 1.25rem; }
.btn--sm { padding: 0.375rem 0.75rem; }
.btn--lg { padding: 0.75rem 1.5rem; }

/* Inputs */
.input { padding: 0.5rem 1rem; }
.input-purple { padding: 0.75rem 1rem; }
```

## Shadows & Elevation

### Shadow Elevation Scale
```css
--shadow-elevation-1: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
--shadow-elevation-2: 0 4px 12px 0 var(--color-shadow-primary-15);
--shadow-elevation-3: 0 8px 32px 0 var(--color-shadow-primary-18);
```

### Usage
- **Elevation 1**: Cards, buttons (default)
- **Elevation 2**: Hover states, elevated cards
- **Elevation 3**: Modals, popovers, dropdowns

## Transitions

### Timing
```css
--transition-fast: 150ms;
--transition-base: 200ms;
--transition-slow: 300ms;
--transition-timing: ease-in-out;
```

### Usage
- **Fast (150ms)**: Hover states, active states, color changes
- **Base (200ms)**: Page transitions, modal animations
- **Slow (300ms)**: Complex animations, loading spinners

## Focus & Accessibility

### Focus Ring
```css
--focus-ring-width: 2px;
--focus-ring-color: var(--color-600);
--focus-ring-offset: 2px;
```

### Active/Tap States
```css
--active-opacity: 0.9;
--active-scale: 0.98;
```

### Disabled States
```css
--opacity-disabled: 0.5;
```

## Border Radius

```css
--radius: 0.5rem;  /* 8px - Base radius */
```

### Tailwind Variants
- `rounded-sm`: `calc(var(--radius) - 4px)`
- `rounded-md`: `calc(var(--radius) - 2px)`
- `rounded-lg`: `var(--radius)`

## Component Interaction Philosophy

### Hover vs Tap Logic

**Desktop (hover: hover and pointer: fine)**
- Hover states: Visual feedback on mouse hover
- Active states: Click feedback
- Cursor: `pointer` shown

**Mobile/Touch**
- No hover states (media query prevents)
- Active states: Tap feedback via `:active` and `[aria-pressed="true"]`
- Cursor: Not shown (touch devices)

### Touch Targets
- Minimum size: **44px × 44px** (WCAG AA)
- All interactive elements respect this rule
- Spacing between targets: Minimum 8px

## Responsive Breakpoints

```css
/* Mobile First Approach */
default: < 640px   /* Mobile */
sm: >= 640px       /* Small tablets */
md: >= 768px       /* Tablets / Desktop */
lg: >= 1024px      /* Large desktop */
xl: >= 1280px      /* Extra large */
```

## Accessibility Features

### Reduced Motion
All animations respect `prefers-reduced-motion: reduce`:
- Animations disabled
- Transitions minimized
- No motion-based interactions

### High Contrast
Support for `prefers-contrast: more`:
- Increased border widths
- Enhanced color contrast
- Better visibility in daylight

### ARIA Attributes
- `aria-live`: For dynamic content updates
- `aria-busy`: For loading states
- `aria-label`: For icon-only buttons
- `role`: Semantic roles (button, dialog, status, article)

## Usage Examples

### Button with Tokens
```tsx
<button className="btn btn--primary">
  Click me
</button>
```

### Card with Elevation
```tsx
<Card className="card card--hover">
  <CardContent>Content</CardContent>
</Card>
```

### Input with Focus Ring
```tsx
<Input className="input-purple" />
```

### Typography
```tsx
<h1 className="text-heading font-heading font-bold">
  Title
</h1>
<p className="text-body font-body">
  Body text
</p>
```

## Migration Notes

### Replacing Hardcoded Values

**Before:**
```tsx
<div style={{ padding: '16px', backgroundColor: '#60368c' }}>
```

**After:**
```tsx
<div className="p-4 bg-primary">
```

### Using CSS Variables Directly

```css
.custom-element {
  color: var(--color-600);
  padding: var(--transition-fast);
  box-shadow: var(--shadow-elevation-2);
}
```

