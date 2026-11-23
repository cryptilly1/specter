# Requirements: Crypt Forge (configurator app)

## Introduction
A product configurator for a lantern. Every panel control and every spoken command produces the same validated Spec.

## Requirements
1. THE app SHALL offer metalwork colour, finish, glass, flame colour, handle style and cap options.
2. WHEN a control is clicked, THE app SHALL apply the change through the op registry, so it can be undone and shared like a spoken command.
3. WHEN the user says "make the frame gold and the glass red", THE app SHALL apply both changes and reflect them in the panel.
4. THE app SHALL use `setVisibility` to swap handle styles and remove the cap.
5. THE app SHALL support Undo, Reset and share links.
