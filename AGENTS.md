# Development instructions

## Automated tests

- Add or update automated tests with every feature, behavior change, and bug fix.
- Cover the successful flow, input validation, authentication or authorization boundaries,
  and the regression being prevented whenever those cases apply.
- Keep tests deterministic and isolated. Integration tests must clean up any records they
  create and must never contain production credentials or reusable secrets.
- Run the relevant test suite, strict typecheck, and production build before considering
  implementation complete.
- Do not remove or weaken an existing test merely to make a change pass; update behavior and
  expectations deliberately.

## Application scrolling and viewport layout

- Keep the document, application shell, and dashboard frame constrained to the viewport. Do not
  introduce body-level or whole-page scrolling in authenticated application screens.
- Put scrolling on the smallest intentional content region. Standard content pages may use the
  dashboard page viewport; data-heavy screens must provide their own bounded scroll regions.
- On data-table pages, keep the page heading, actions, filters, table header, and pagination fixed.
  Only the table row/data region should scroll vertically; horizontal overflow belongs to that same
  table region.
- Drawers and dialogs must keep their headers and action footers fixed while only their body content
  scrolls.
- Use `min-h-0`, explicit viewport or parent heights, and `overflow-hidden`/`overflow-auto` deliberately
  in nested flex layouts so overflow does not escape to the document.
- Verify new or changed layouts at desktop and narrow viewport sizes and add regression coverage for
  the intended scroll container.

## Authenticated page structure and visual hierarchy

- Use the Contact Hub page as the reference structure for new authenticated application pages.
  Preserve this hierarchy unless a page has a documented product requirement for a different layout.
- The page root must fill the dashboard viewport with `h-full`, use a column flex layout, and apply
  `overflow-hidden`. It must not add top spacing between the page and the application navbar.
- Place the page identity section directly beneath and visually attached to the application navbar.
  This section must be a full-width white band with a subtle bottom border and very light shadow.
- Constrain the page-header contents to the same centered maximum width as the main content
  (`max-w-[1400px]` by default) and use consistent responsive horizontal padding.
- Keep page titles compact at approximately 19px medium weight with a tight line height.
- Do not add subtitles, descriptions, helper text, or secondary copy beneath authenticated page
  header titles unless the user explicitly requests it for that specific page.
- Place primary page actions on the right side of the page header. Keep secondary actions outlined
  and the main action brand-filled. Allow actions to wrap beneath the title block on narrow screens.
- Use `var(--page-background)` for the content area below the white page header. Keep filters and
  toolbars in a fixed, non-scrolling row above the primary content panel.
- Structure the main content container as `flex min-h-0 flex-1 flex-col`. Panels that consume the
  remaining height must also use `min-h-0` so their intended internal scrolling works correctly.
- For data tables, use a bordered white surface with a subtle shadow. Keep the table header sticky,
  put vertical and horizontal overflow on the table-data region, and keep totals and pagination in a
  fixed footer outside that scroll region.
- Keep the global navbar shadow restrained. Prefer borders and spacing for hierarchy; avoid heavy or
  stacked shadows on the navbar, attached page header, and content panel.
- Reuse shared page-header, toolbar, table, drawer, and dialog primitives when they exist so later pages
  inherit these layout rules instead of recreating slightly different structures.

## Contact phone-number inputs

- Use the shared international phone input for every contact phone-number entry form. Do not use a
  single free-form input that requires users to type the calling code themselves.
- Show a country/calling-code selector beside the local phone-number field and default it to India
  (`+91`) unless an existing contact or workspace setting provides another country.
- Use the installed `react-international-phone` component so country metadata, flag assets, keyboard
  navigation, formatting, and country guessing remain maintained by the library.
- Store or submit the complete E.164 number returned by the shared library component. Do not manually
  concatenate calling codes or maintain a separate hard-coded country list.
