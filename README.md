# Oasis Kinks

A small React app for working through a checklist of kinks and rating each one. Pick a rating for every item, add your own items, then export the results as a color-coded PNG or as JSON to share with a partner. Everything runs in the browser; nothing is sent anywhere.

## Using the app

- **Name your list.** The landing page offers an optional list name. Leave it blank to start right away. A name is shown in the header and included in the JSON export. **New list** in the header returns to the landing page (after a confirmation) and clears all ratings and custom items.
- **Rate items.** Each item has six ratings, each with its own color and icon so they are distinguishable without color: **Hard Limit** (X), **Never** (triangle), **Ask Me** (square), **Willing** (circle), **Love** (heart), and **Crave** (star). Every item starts as **Ask Me**. After you choose a rating the app moves to the next item, and **Skip for now** moves on without changing anything.
- **Two-sided categories.** Some categories ask for two ratings per item (for example **self** and **partner**). The app advances once both are chosen.
- **Navigate.** The menu on the left lists every category and item, highlights where you are, and jumps to any item when clicked. Small dots next to each item show the rating you chose (one dot, or two for two-sided categories). On desktop the menu is always visible; on mobile, tap the **Oasis Kinks** logo to open it.
- **Add your own items.** Each category ends with a **+ New Item** button. Name the item on its card and rate it using that category's rules. Use **Remove this item** to delete it.
- **Export.** **Export PNG** and **Export JSON** are in the header and can be used at any time.

- **Import.** The landing page can also restore a previous **Export JSON** file: choose the file and click **Import** (no list name needed). The list name, ratings and custom items are restored; items that no longer match the current list are skipped.

Progress is saved automatically in this browser (localStorage, nothing is sent anywhere). When you return, the landing page offers **Resume** (or **Discard**). **New list** and **Discard** clear the saved copy. Clearing site data or using another browser loses it, so export a copy to back up or share.

## Run locally

```sh
npm install
npm run dev
```

Built with React, TypeScript, Vite, and Bootstrap.

## Deploy to GitHub Pages

The `main` branch is deployed automatically to [https://vstar200000.github.io/kinkr/](https://vstar200000.github.io/kinkr/) by the GitHub Actions workflow in `.github/workflows/pages.yml`. To enable it:

1. In the repository, open **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push or merge your changes to `main`.
4. In **Actions**, wait for **Deploy to GitHub Pages** to finish successfully.
5. Open [https://vstar200000.github.io/kinkr/](https://vstar200000.github.io/kinkr/).

The workflow builds the site and deploys `dist`; there is no need to commit the generated build directory.

## Update the item list

Edit [`src/data/items.json`](./src/data/items.json). The list is grouped into categories; each item needs a `name` and may include a `description`, an `image`, and `"extended": true`. Extended items are hidden (not shown, not in the menu, not exported) unless **Include extended items** is checked on the landing page. Add `"extended": true` to a category to flag all of its items at once; a category whose items are all extended is treated as extended too.

```json
[
  {
    "category": "Examples",
    "items": [
      {
        "name": "An item",
        "description": "Optional extra detail.",
        "image": "/images/example.jpg"
      }
    ]
  }
]
```

For local images, put the files under `public/` and reference them from the root, such as `/images/example.jpg`. Items are shown in category and list order.

### Two-sided ratings

Add one of these flags to a category to have every item in it rated twice on the same scale:

| Flag                       | Ratings                      |
| -------------------------- | ---------------------------- |
| `"self-partner": true`     | **self** and **partner**     |
| `"giving-receiving": true` | **giving** and **receiving** |
| `"actor-subject": true`    | **actor** and **subject**    |

```json
{
  "category": "Examples",
  "self-partner": true,
  "items": [{ "name": "An item" }]
}
```

## Export

### PNG

Downloads `oasis-kinks-results-YYYY-MM-DD.png`. Each item is a row with its rating icon in the rating color (see [`src/ratings.ts`](./src/ratings.ts)), with an icon legend in the top right. If you named the list, the name is the image title, with "Oasis Kinks results" in smaller text beneath it. Unrated slots show a small empty circle. Two-sided categories get two labeled icon columns. Categories flow into as many columns as make the image closest to square, and category and item order is preserved.

### JSON

Downloads `oasis-kinks-results-YYYY-MM-DD.json` containing:

- `formatVersion`: currently `3`
- `listName`: the list name, only present if one was entered
- `includeExtended`: `true` if extended items were included (omitted otherwise)
- `exportedAt`: an ISO timestamp
- `categories`: each category with its two-sided flag (if any) and its items

Each item has a `name`, its optional `description` and `image`, and a `rating` of `Hard Limit`, `Never`, `Ask Me`, `Willing`, `Love`, or `Crave`. In two-sided categories, `rating` is an object keyed by role, such as `{ "self": "Love", "partner": "Ask Me" }`. Custom items appear after the category's built-in items and include `"custom": true`.

## TODO

- [x] Add % complete display.
- [x] Implement option to rename a list.
- [x] Don't default highlight "Ask Me". Only set as default if the user skips.
- [x] Fill out the descriptions for every item, even on the extended list.
- [x] Implement an "all done!" page after every item is answered (keep the navigation visible)
- [ ] Build unit and integration tests.
- [x] The page height should be limited to the view height.
- [x] "Multiple x partners" items need to be reworked. The don't make sense being self-partner.
- [x] Items that don't make sense to be actor-subject:
      "Condoms", "Docking", "Frotting", "Mutual Masturbation", "Smoking", "Socks/Stockings", "Tribadism/Scissoring", "Underwear"
- [x] Items to be removed due to redundancy:
      "Leather" from Particular Actions/Elements
- [x] Clarify "Cum Placement" category.
- [x] Split "Primal" into "Hunter" and "Prey".
- [x] Consider "Dynamics" category.
- [x] Introduce migration system. Press a button with V3 loaded, and it upgrades the save to V4.
- [ ] Implement "type_override", for items that fit into a category, but need to have a different answer type.
- [ ] Certain items should be excluded from extended list because they are replaced by more specific other items. (e.g. "Anal Play" should be replaced with multiple different items in extended mode.)
- [ ] Set the following to a split-answer type: Ass Play, Breeding, Bukakke, CNC, cumflation, edging, egg impregnation(ovipositor), electro stim, foot play, free use, glory hole, Harem, Gangbang, humiliation, hypnotizing, Milking Breasts/Cock, Pet Play, Shibari, Sleepplay, stocks, vore, water sports, wax play, Big/little, dom/Brat, Dom/Sub, Hunter(Primal)/Prey, Navel Play
- [x] Rewrite Caregiver to be parent/child rather than injured/nurse.
- [x] Move meta-items to the extended list.
- [x] Move items that are unlikely to cause issues to the extended list: Flexibility/Contortionism, Frotting/Scissoring, Gender transformation, Teasing, Transformation, Underwear play, Curvy, Muscular, Skinny, Small Balls/breasts/cock, uncircumsized, Navel Play, strip tease, clothing category, Chubby, hairless, hairy
- [x] Remove items that are redundant or can be otherwise inferred: Magic (kinetics), Twins, Magic (influence) or hypnotising, the entire Single partner expression category,
- [x] Things that should be moved/added to the normal list: Choking, Fisting, Sounding, Spanking.
- [x] Dullahan -> undead
- [ ] Allow version downgrade migration

## Validate

```sh
npm run build
npm run lint
```
