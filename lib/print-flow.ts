// Page-flow rules shared by every printed / emailed HTML report, so a
// section heading never sits alone at the bottom of a page:
// - [data-section-title] headings stay with what follows them;
// - a section ([data-section], the heading's parent) moves to the next
//   page whole when it fits on one, unless it holds a table;
// - tables can split, but their header row repeats on each page and a
//   row is never cut in half;
// - [data-keep] blocks (commentary cards, charts) never split.
export const PRINT_FLOW_CSS = `
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  tr, img, svg, canvas, [data-keep] { break-inside: avoid; page-break-inside: avoid; }
  [data-section-title] { break-after: avoid; page-break-after: avoid; }
  [data-section-title] + * { break-before: avoid; page-break-before: avoid; }
  [data-section] { break-inside: avoid; page-break-inside: avoid; }
  [data-section]:has(table), [data-section]:has([data-section]) { break-inside: auto; page-break-inside: auto; }
`;

// Marks each heading's parent as its section (on a cloned report, before
// it's turned into a printable document).
export function tagPrintSections(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-section-title]").forEach((t) => {
    t.parentElement?.setAttribute("data-section", "true");
  });
}
