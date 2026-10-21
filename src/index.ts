// svg-panel: pictures for Claude Code mod panels. Every component is
// `(data, options) => Picture`: `svg` for an `Svg` element, `alt` for its
// required words, `twin` as a line of text, `isInteractive` for its flag;
// `toRaster(picture)` gives the cells of a terminal `Raster`. It makes data
// only: which form a mod shows, where and how, is the mod's to decide.

export { abbreviate, assertBudget, esc, extent, FONT, num, SVG_BUDGET, svgDoc, text, textWidth, type DocOptions, type Picture } from './core.ts'
export { arcPath, linePath, niceMax, polar, scale, type Point, type Scale } from './geom.ts'
export { dark, light, pickTheme, STATUS_TEXT_COLOR, STATUS_WORD, themes, type Status, type Theme } from './theme.ts'
export { BAR_EMPTY, BAR_FULL, BAR_TICK, bar, BLOCKS, blocks, thin, type BarOptions, type BlocksOptions } from './twin.ts'
export { marker, SHAPE_GLYPH, type Shape } from './marks.ts'
export { gauge, GAUGE_ARC, GAUGE_SIZE, GAUGE_SWEEP, gaugeAngle, statusOf, type GaugeData, type GaugeOptions } from './gauge.ts'
export { meter, METER_PAD, METER_TRACK, zoneOf, type MeterData, type MeterOptions, type Zone } from './meter.ts'
export { SPARK_PAD, sparkline, sparkPoints, type SparklineOptions } from './sparkline.ts'
export { timeline, type EventKind, type TimelineData, type TimelineEvent, type TimelineOptions } from './timeline.ts'
export { dotRow, place, statTile, svgSize, type DotRowOptions, type StatTileData, type StatTileOptions } from './statTile.ts'
export { icon, ICON_NAMES, iconMark, ICONS, type IconName, type IconOptions, type IconPicture, type IconTextColor } from './icon.ts'
export { legend, legendMarkup, legendTwin, type LegendItem, type LegendOptions } from './legend.ts'
export { barLayout, bars, BARS_PAD, type BarItem, type BarsOptions } from './bars.ts'
export { donut, DONUT_GAP, DONUT_RING, donutShares, type DonutOptions, type Slice } from './donut.ts'
export { HEAT_SHADES, HEAT_STEPS, heatColors, heatmap, heatStep, type HeatmapData, type HeatmapOptions } from './heatmap.ts'
export { fitLabel, STATUS_GLYPH, statusGrid, type StatusGridOptions, type StatusItem } from './statusGrid.ts'
export { dash, dots, fillCircle, fillPolygon, fillRoundRect, hexRgb, strokeCircle, strokePolyline, strokeRoundRect, type Cap, type Dots, type Rgb } from './dots.ts'
export { arcPoints, gradientColors, hiddenClasses, MIN_STROKE, pathPoints, readSvg, snapLine, type Label, type Painted } from './readSvg.ts'
export {
  ansi,
  BLOCK_GLYPHS,
  BRAILLE_INK,
  brailleOf,
  CELL_PX,
  cellChars,
  decodeCells,
  DEFAULT_COLOR,
  encodeCells,
  fitCell,
  gridText,
  packRgb,
  RASTER_MAX,
  rasterGrid,
  toRaster,
  type Cell,
  type Grid,
  type RasterCells,
  type RasterOptions,
  type RasterPicture,
} from './raster.ts'
