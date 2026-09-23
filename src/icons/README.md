# Category icon pack

The icons a user can choose for a category, and the ones the app guesses from
a category's name. The pack is built into the app: nothing is fetched at run
time, so the CSP stays `default-src 'self'`.

## Add an icon

1. Get the icon as an SVG file. From Material Symbols: fonts.google.com/icons,
   pick the icon, style **Outlined**, weight 400, grade 0, optical size 24,
   then **Download SVG**.
2. Save it in `category/` as `<id>.svg`. The id is lower case letters, digits
   and underscores; for Material Symbols use the icon's own name
   (`menu_book.svg`, `sports_soccer.svg`).
3. Add one line to `manifest` in `pack.ts`:
   `{ id: 'menu_book', name: 'Bok', keywords: ['bok', 'bøk'] },`
   - `name`: the Norwegian name the picker shows and a screen reader says.
   - `keywords`: words that make the app suggest this icon for a category.
     A keyword matches when it starts a word in the category's name, so
     `bok` matches «Bøker og leker» only through `bøk`. Leave it empty for an
     icon that is only chosen by hand.
   - `source`: only when the icon is not from Material Symbols (see below).
4. Run `npm test`. The pack test fails if a file has no line in the manifest,
   a line has no file, an id appears twice, or a file cannot be read.

The order of the manifest is the order of the suggestion: the first icon with
a matching keyword wins. `category` (Annet) is the neutral icon and stays last.

## Change an icon

Replace the SVG file and keep its name. Things whose category uses that icon
show the new drawing at once. To rename an icon, rename both the file and the
id in the manifest; a category that had chosen the old id falls back to the
suggestion from its name.

## Remove an icon

Delete the file and its line. A category that had chosen it falls back to the
suggestion from its name. Never remove `category`.

## What a file must look like

- One colour, drawn with `<path d="...">` elements. The app keeps only the
  `viewBox` and the `d` of each path and fills them with the text colour, so
  strokes, circles, rects, gradients, several colours and `fill-rule` are
  lost. Convert shapes to paths first (in Figma: Outline stroke, Flatten).
- A `viewBox` on the `<svg>` element, or `width` and `height` to make one
  from. Any size works; the app scales it.

## Sources and licences

| Source | Licence | Icons |
|---|---|---|
| Material Symbols (Google) | Apache License 2.0 | Every icon without a `source` in the manifest |

An icon from another source gets `source: '<name> (<licence>)'` in its
manifest line, a row in the table above, and a line in the project README's
third-party list. Tell Claude which source it is, and the documentation is
updated with it.
