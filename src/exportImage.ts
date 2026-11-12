export interface ExportRating {
  value: number;
  label: string;
  color: string;
  path: string;
}

export interface ExportItem {
  name: string;
  category: string;
  roles: string[];
  ratings: (number | null)[];
}

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SCALE = 2;
const PAD = 40;
const ROW_H = 34;
const RADIUS = 11;
const COL_W = 84;
const LEGEND_ROW_H = 24;
const LEGEND_GAP = 20;
const COLUMN_GAP = 48;
const GROUP_HEAD_H = 40;
const GROUP_GAP = 16;
const ROLE_LABEL_FONT = `600 13px ${FONT}`;
const ROLE_LABEL_GAP = 12;

type ItemGroup = {
  category: string;
  items: ExportItem[];
};

type LayoutBlock = {
  group: ItemGroup;
  height: number;
  width: number;
};

type LegendEntry = {
  option: ExportRating;
  width: number;
};

type LegendLayout = {
  rows: LegendEntry[][];
  width: number;
  height: number;
};

type ResultsLayout = {
  columns: LayoutBlock[][];
  legend: LegendLayout;
  headerH: number;
  width: number;
  height: number;
};

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function drawIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  option: { color: string; path: string } | null,
  size = RADIUS * 2,
) {
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 16, size / 16);
  if (option) {
    const path = new Path2D(option.path);
    ctx.fillStyle = option.color;
    ctx.fill(path, "evenodd");
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 0.7;
    ctx.lineJoin = "round";
    ctx.stroke(path);
  } else {
    ctx.beginPath();
    ctx.arc(8, 8, 3.5, 0, Math.PI * 2);
    ctx.strokeStyle = "#b5b5bd";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function groupItems(items: ExportItem[]): ItemGroup[] {
  const groups: ItemGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.category === item.category) {
      last.items.push(item);
    } else {
      groups.push({
        category: item.category,
        items: [item],
      });
    }
  }
  return groups;
}

function createTextMeasurer() {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) {
    throw new Error("Canvas is not supported in this browser.");
  }
  return (font: string, text: string) => {
    measure.font = font;
    return measure.measureText(text).width;
  };
}

function measureBlocks(
  groups: ItemGroup[],
  textWidth: (font: string, text: string) => number,
  labelWidth: number,
): LayoutBlock[] {
  const answerWidthOf = (item: ExportItem) =>
    item.roles.length < 2 ? COL_W : 2 * COL_W + labelWidth;

  return groups.map((group) => ({
    group,
    height: GROUP_HEAD_H + group.items.length * ROW_H + GROUP_GAP,
    width: Math.max(
      textWidth(`700 20px ${FONT}`, group.category),
      ...group.items.map(
        (item) =>
          textWidth(`15px ${FONT}`, item.name) + 28 + answerWidthOf(item),
      ),
    ),
  }));
}

function layoutLegend(
  entries: LegendEntry[],
  maxWidth: number,
): LegendLayout {
  const rows: LegendEntry[][] = [[]];
  for (const entry of entries) {
    const row = rows[rows.length - 1];
    const rowWidth =
      row.reduce((sum, e) => sum + e.width + LEGEND_GAP, 0) + entry.width;
    if (row.length > 0 && rowWidth > maxWidth) {
      rows.push([entry]);
    } else {
      row.push(entry);
    }
  }
  const width = Math.max(
    ...rows.map(
      (row) =>
        row.reduce((sum, e) => sum + e.width, 0) +
        LEGEND_GAP * (row.length - 1),
    ),
  );
  return { rows, width, height: rows.length * LEGEND_ROW_H };
}

function splitColumns(blocks: LayoutBlock[], count: number) {
  // Split blocks into contiguous columns, minimizing the tallest column.
  const total = blocks.reduce((sum, b) => sum + b.height, 0);
  let low = Math.max(...blocks.map((b) => b.height));
  let high = total;
  const fill = (cap: number) => {
    const cols: LayoutBlock[][] = [[]];
    let used = 0;
    for (const block of blocks) {
      if (used + block.height > cap && cols[cols.length - 1].length > 0) {
        cols.push([]);
        used = 0;
      }
      cols[cols.length - 1].push(block);
      used += block.height;
    }
    return cols;
  };
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (fill(mid).length <= count) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return fill(low);
}

function buildLayout(
  count: number,
  blocks: LayoutBlock[],
  columnWidth: number,
  titleWidth: number,
  legendEntries: LegendEntry[],
): ResultsLayout {
  const columns = splitColumns(blocks, count);
  const columnsWidth =
    columns.length * columnWidth + (columns.length - 1) * COLUMN_GAP;
  const legend = layoutLegend(
    legendEntries,
    Math.max(columnsWidth - titleWidth - 40, 260),
  );
  const contentWidth = Math.ceil(
    Math.max(columnsWidth, titleWidth + 40 + legend.width),
  );
  const headerH = Math.max(80, legend.height) + PAD + 16;
  const tallest = Math.max(
    ...columns.map((col) => col.reduce((sum, b) => sum + b.height, 0)),
  );
  return {
    columns,
    legend,
    headerH,
    width: contentWidth + PAD * 2,
    height: headerH + tallest + PAD - GROUP_GAP,
  };
}

function chooseLayout(
  blocks: LayoutBlock[],
  columnWidth: number,
  titleWidth: number,
  legendEntries: LegendEntry[],
): ResultsLayout {
  // Pick the column count whose image is closest to square.
  let layout = buildLayout(1, blocks, columnWidth, titleWidth, legendEntries);
  for (let count = 2; count <= blocks.length; count += 1) {
    const candidate = buildLayout(
      count,
      blocks,
      columnWidth,
      titleWidth,
      legendEntries,
    );
    const score = (result: ResultsLayout) =>
      Math.abs(Math.log(result.width / result.height));
    if (score(candidate) < score(layout)) {
      layout = candidate;
    }
  }
  return layout;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  title: string,
  listName: string,
  width: number,
  legend: LegendLayout,
) {
  ctx.fillStyle = "#24212b";
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(title, PAD, PAD + 8);
  if (listName) {
    ctx.fillStyle = "#6b6775";
    ctx.font = `14px ${FONT}`;
    ctx.fillText("Oasis Kinks results", PAD, PAD + 38);
  }

  const legendX = width - PAD - legend.width;
  ctx.font = `14px ${FONT}`;
  legend.rows.forEach((row, rowIndex) => {
    const cy = PAD + LEGEND_ROW_H / 2 + rowIndex * LEGEND_ROW_H;
    let x = legendX;
    for (const { option, width: entryWidth } of row) {
      drawIcon(ctx, x + 8, cy, option, 18);
      ctx.fillStyle = "#24212b";
      ctx.textAlign = "left";
      ctx.fillText(option.label, x + 24, cy);
      x += entryWidth + LEGEND_GAP;
    }
  });
}

function drawItem(
  ctx: CanvasRenderingContext2D,
  item: ExportItem,
  left: number,
  rightEdge: number,
  y: number,
  labelWidth: number,
  optionOf: (value: number | null) => ExportRating | null,
) {
  const cy = y + ROW_H / 2;
  ctx.fillStyle = "#24212b";
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(item.name, left, cy);
  if (item.roles.length < 2) {
    drawIcon(ctx, rightEdge - COL_W / 2, cy, optionOf(item.ratings[0]));
    return;
  }

  const roleLabel = item.roles.map(titleCase).join("/");
  const firstRatingX = rightEdge - 2 * COL_W - labelWidth + COL_W / 2;
  const labelX = rightEdge - COL_W - labelWidth / 2;
  ctx.fillStyle = "#6b6775";
  ctx.font = ROLE_LABEL_FONT;
  ctx.textAlign = "center";
  drawIcon(ctx, firstRatingX, cy, optionOf(item.ratings[0]));
  ctx.fillText(roleLabel, labelX, cy);
  drawIcon(ctx, rightEdge - COL_W / 2, cy, optionOf(item.ratings[1]));
}

function drawColumns(
  ctx: CanvasRenderingContext2D,
  columns: LayoutBlock[][],
  columnWidth: number,
  headerH: number,
  labelWidth: number,
  optionOf: (value: number | null) => ExportRating | null,
) {
  columns.forEach((column, columnIndex) => {
    const left = PAD + columnIndex * (columnWidth + COLUMN_GAP);
    const rightEdge = left + columnWidth;
    let y = headerH;

    for (const { group } of column) {
      ctx.fillStyle = "#7c234e";
      ctx.font = `700 20px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(group.category, left, y + 16);

      ctx.strokeStyle = "#e3e1e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, y + GROUP_HEAD_H - 6);
      ctx.lineTo(rightEdge, y + GROUP_HEAD_H - 6);
      ctx.stroke();
      y += GROUP_HEAD_H;

      for (const item of group.items) {
        drawItem(ctx, item, left, rightEdge, y, labelWidth, optionOf);
        y += ROW_H;
      }
      y += GROUP_GAP;
    }
  });
}

export function renderResultsCanvas(
  items: ExportItem[],
  ratingOptions: readonly ExportRating[],
  listName = "",
) {
  const optionOf = (value: number | null) =>
    ratingOptions.find((option) => option.value === value) ?? null;
  const groups = groupItems(items);
  const textWidth = createTextMeasurer();
  const title = listName || "Oasis Kinks results";
  const titleWidth = textWidth(`700 30px ${FONT}`, title);
  // Every two-role answer column uses the widest label so the columns line up
  const labelWidth =
    Math.max(
      0,
      ...items
        .filter((item) => item.roles.length >= 2)
        .map((item) =>
          textWidth(ROLE_LABEL_FONT, item.roles.map(titleCase).join("/")),
        ),
    ) +
    2 * ROLE_LABEL_GAP;
  const blocks = measureBlocks(groups, textWidth, labelWidth);
  const columnWidth = Math.ceil(Math.max(...blocks.map((b) => b.width)));
  const legendEntries = ratingOptions.map((option) => ({
    option,
    width: 24 + textWidth(`14px ${FONT}`, option.label),
  }));
  const layout = chooseLayout(blocks, columnWidth, titleWidth, legendEntries);
  const { columns, legend, headerH, width: WIDTH, height } = layout;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported in this browser.");
  }
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = "middle";
  drawHeader(ctx, title, listName, WIDTH, legend);
  drawColumns(ctx, columns, columnWidth, headerH, labelWidth, optionOf);
  return canvas;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not create PNG."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
