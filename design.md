# Design System Specification: The Editorial Workspace
 
## 1. Overview & Creative North Star: "The Silent Curator"
This design system is built on the philosophy of **The Silent Curator**. In the world of screenwriting, the interface must vanish to allow the story to breathe. We are moving away from the "software" look—cluttered with lines, grids, and heavy chrome—and toward a high-end editorial experience. 
 
The aesthetic is **Soft Minimalism**. We achieve structure through intentional asymmetry and tonal depth rather than rigid lines. By leveraging a high-contrast typography scale and "nested" surfaces, we create a digital environment that feels as tactile and focused as a physical desk in a sunlit studio.
 
---
 
## 2. Colors: Tonal Atmosphere
Our palette is designed to reduce cognitive load during long writing sessions. We prioritize "soft" contrast to prevent eye fatigue while maintaining professional authority.
 
### The Palette (Material Design Tokens)
*   **Primary (The Narrative Anchor):** `#0b4351` (Deep Teal). Use this for core actions and focus states. It represents the "ink" of the digital world.
*   **Surface (The Paper):** `#faf9f6` (Soft Off-White). This is our base layer, mimicking premium stationery.
*   **On-Surface (The Graphite):** `#1a1c1a` (Deep Charcoal). Never pure black; this provides a softer, more sophisticated legibility.
 
### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. 
Structure is defined solely through background color shifts. For example, a sidebar should not be "separated" by a line; instead, it should be a `surface-container-low` section sitting against a `surface` background.
 
### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the `surface-container` tiers to define "Importance through Depth":
*   **Base Layer:** `surface` (#faf9f6)
*   **Nesting Level 1:** `surface-container-low` (#f4f3f1) for secondary toolbars.
*   **Nesting Level 2:** `surface-container` (#efeeeb) for grouping related content.
*   **Nesting Level 3:** `surface-container-high` (#e9e8e5) for active workspace components.
 
### The "Glass & Gradient" Rule
To elevate the system beyond a "flat" template, use **Glassmorphism** for floating elements like formatting bars or navigation overlays.
*   **Backdrop Blur:** Use 12px–20px blur with a semi-transparent `surface` color (e.g., 80% opacity).
*   **Signature Texture:** Main CTAs should use a subtle linear gradient from `primary` (#0b4351) to `primary_container` (#2a5b69) at a 135-degree angle to add "soul" and depth.
 
---
 
## 3. Typography: The Editorial Voice
Typography is the core of this system. We use a dual-font approach to separate "The Work" (the script) from "The Tool" (the UI).
 
### The Typefaces
*   **The Content (Newsreader - Serif):** Used for `display`, `headline`, and script body. This provides the literary, cinematic feel necessary for a screenplay editor.
*   **The Interface (Manrope - Sans-serif):** Used for `title`, `label`, and `body-sm`. Manrope is geometric and modern, ensuring the UI feels like a precision instrument.
 
### Typography Scale
*   **Display LG (Newsreader):** 3.5rem. For high-impact branding moments or script titles.
*   **Headline MD (Newsreader):** 1.75rem. For chapter or scene headings.
*   **Title SM (Manrope):** 1rem. For sidebar labels and navigation.
*   **Body LG (Manrope):** 1rem. For general UI text and descriptions.
*   **Label MD (Manrope):** 0.75rem. For metadata, word counts, and timestamps.
 
---
 
## 4. Elevation & Depth: Tonal Layering
Traditional shadows are often "muddy." We replace them with **Ambient Tonal Layering**.
 
*   **The Layering Principle:** Achieve lift by "stacking" container tiers. Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#f4f3f1) section. This creates a natural, soft lift without visual noise.
*   **Ambient Shadows:** For floating elements (Modals/Popovers), use a "Sunlit Shadow": 
    *   Blur: 32px | Opacity: 6% | Color: Derived from `on-surface` (#1a1c1a).
*   **The "Ghost Border" Fallback:** If accessibility requires a border (e.g., in a high-glare environment), use the `outline-variant` (#c0c8cb) at **15% opacity**. Never use high-contrast outlines.
 
---
 
## 5. Components: Precision & Clarity
 
### Buttons
*   **Primary:** Gradient fill (`primary` to `primary_container`). `rounded-md` (0.375rem). No border.
*   **Secondary:** `surface-container-highest` background. Text in `primary`.
*   **Tertiary:** Ghost style. No background, text in `secondary`.
 
### The Script Editor Card
*   **Constraint:** Forbid the use of divider lines between script elements (Dialogue vs. Action).
*   **Implementation:** Use vertical white space from the spacing scale (e.g., `2rem` between scenes) and subtle background shifts (`surface` to `surface-container-lowest`) to denote the active writing area.
 
### Input Fields
*   **Style:** Minimalist. Only a bottom "Ghost Border" (15% `outline-variant`) that transforms into a `primary` color 2px underline upon focus.
*   **Labels:** Always use `label-md` in `on-surface-variant` for floating labels.
 
### Floating Toolbar (Glassmorphism)
*   **Context:** Script formatting tools (Bold, Italics, Scene Heading).
*   **Style:** A `rounded-full` container using a `surface` backdrop blur. This should feel like it's hovering over the "paper" of the script.
 
---
 
## 6. Do's and Don'ts
 
### Do:
*   **Do** use asymmetrical margins to create a sense of "Editorial White Space." 
*   **Do** prioritize the Serif typeface (`Newsreader`) for anything that represents the user's creative output.
*   **Do** use `surface-container` shifts to group content instead of lines.
*   **Do** ensure all interactive elements have a minimum 44px tap target for mobile-desktop parity.
 
### Don't:
*   **Don't** use 100% black text. Always use `on-surface` (#1a1c1a).
*   **Don't** use standard "drop shadows" with high opacity; they feel "cheap" and dated.
*   **Don't** use 1px dividers to separate list items. Use a `12px` gap and a subtle hover state shift to `surface-container-low`.
*   **Don't** use sharp 90-degree corners. Everything must feel approachable through the `DEFAULT` (0.25rem) or `md` (0.375rem) roundedness scale.
 
---
 
*Director's Note: Every pixel must serve the writer's focus. If a design element doesn't help the story get told, remove it.*
