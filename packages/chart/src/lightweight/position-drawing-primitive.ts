import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

import type { PositionDrawing } from "../chart-adapter";
import { positionRewardRiskRatio } from "../position-drawing";

interface PositionCoordinates {
  readonly x1: number;
  readonly x2: number;
  readonly entryY: number;
  readonly stopY: number;
  readonly targetY: number;
}

const toChartTimestamp = (timestamp: number): UTCTimestamp =>
  Math.floor(timestamp / 1_000) as UTCTimestamp;

class PositionPaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coordinates: () => PositionCoordinates | null,
    private readonly drawing: () => PositionDrawing,
    private readonly isSelectedOrHovered: () => boolean,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coordinates = this.coordinates();
    if (!coordinates) return;
    const drawing = this.drawing();
    const riskPercent =
      drawing.entry > 0
        ? (Math.abs(drawing.entry - drawing.stopLoss) / drawing.entry) * 100
        : 0;
    const rewardPercent =
      drawing.entry > 0
        ? (Math.abs(drawing.takeProfit - drawing.entry) / drawing.entry) * 100
        : 0;
    const rewardRisk = positionRewardRiskRatio(drawing);
    const selectedOrHovered = this.isSelectedOrHovered();

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio }) => {
        const x1 =
          Math.min(coordinates.x1, coordinates.x2) * horizontalPixelRatio;
        const x2 =
          Math.max(coordinates.x1, coordinates.x2) * horizontalPixelRatio;
        const width = Math.max(72 * horizontalPixelRatio, x2 - x1);
        const rightX = x1 + width;
        const entryY = coordinates.entryY * verticalPixelRatio;
        const stopY = coordinates.stopY * verticalPixelRatio;
        const targetY = coordinates.targetY * verticalPixelRatio;
        const targetTop = Math.min(entryY, targetY);
        const stopTop = Math.min(entryY, stopY);
        const targetHeight = Math.abs(targetY - entryY);
        const stopHeight = Math.abs(stopY - entryY);

        context.save();

        // Translucent green profit rectangle and red risk rectangle
        context.fillStyle = "rgba(37, 169, 119, 0.16)";
        context.fillRect(x1, targetTop, width, targetHeight);
        context.fillStyle = "rgba(220, 83, 98, 0.17)";
        context.fillRect(x1, stopTop, width, stopHeight);

        // Horizontal lines
        const drawLine = (y: number, color: string, dashed = false) => {
          context.strokeStyle = color;
          context.lineWidth = Math.max(1, Math.round(1 * horizontalPixelRatio));
          context.setLineDash(
            dashed
              ? [4 * horizontalPixelRatio, 3 * horizontalPixelRatio]
              : [],
          );
          context.beginPath();
          context.moveTo(x1, y);
          context.lineTo(rightX, y);
          context.stroke();
        };

        // Green dashed target line, red dashed stop line, solid blue entry line
        drawLine(targetY, "#29b57a", true);
        drawLine(stopY, "#e05263", true);
        drawLine(entryY, "#5fa8ff", false);

        // Boundary vertical lines
        context.strokeStyle = selectedOrHovered
          ? "rgba(95, 168, 255, 0.6)"
          : "rgba(120, 140, 160, 0.28)";
        context.lineWidth = Math.max(1, Math.round(1 * horizontalPixelRatio));
        context.setLineDash([2 * horizontalPixelRatio, 2 * horizontalPixelRatio]);
        const overallTop = Math.min(targetTop, stopTop);
        const overallBottom = Math.max(
          targetTop + targetHeight,
          stopTop + stopHeight,
        );
        context.beginPath();
        context.moveTo(x1, overallTop);
        context.lineTo(x1, overallBottom);
        context.moveTo(rightX, overallTop);
        context.lineTo(rightX, overallBottom);
        context.stroke();
        context.setLineDash([]);

        // Readable typography with subtle contrast badge background
        const fontSize = Math.max(10, Math.round(11 * verticalPixelRatio));
        context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        context.textBaseline = "middle";

        const labelPaddingX = 6 * horizontalPixelRatio;
        const textX = x1 + labelPaddingX;

        const rrLabel = `${drawing.direction.toUpperCase()} ${rewardRisk.toFixed(2)}R`;
        const tpLabel = `TP +${rewardPercent.toFixed(2)}%`;
        const slLabel = `SL -${riskPercent.toFixed(2)}%`;

        const drawBadgeText = (
          text: string,
          x: number,
          y: number,
          textColor: string,
        ) => {
          const metrics = context.measureText(text);
          const bgPadding = 3 * horizontalPixelRatio;
          const bgHeight = fontSize + 4 * verticalPixelRatio;
          const bgY = y - bgHeight / 2;
          context.fillStyle = "rgba(17, 24, 32, 0.78)";
          context.fillRect(
            x - bgPadding,
            bgY,
            metrics.width + bgPadding * 2,
            bgHeight,
          );
          context.fillStyle = textColor;
          context.fillText(text, x, y);
        };

        const isLong = drawing.direction === "long";
        const entryOffset =
          (isLong ? -1 : 1) * (fontSize + 3 * verticalPixelRatio);
        const tpOffset =
          (targetY < entryY ? 1 : -1) * (fontSize + 3 * verticalPixelRatio);
        const slOffset =
          (stopY > entryY ? -1 : 1) * (fontSize + 3 * verticalPixelRatio);

        drawBadgeText(rrLabel, textX, entryY + entryOffset, "#dce7f0");
        drawBadgeText(tpLabel, textX, targetY + tpOffset, "#66d6a3");
        drawBadgeText(slLabel, textX, stopY + slOffset, "#ff7d8a");

        // When selected (or hovered): render discrete visual drag handles
        if (selectedOrHovered) {
          const handleRadius = Math.max(3.5, 4 * horizontalPixelRatio);
          const midX = (x1 + rightX) / 2;
          const handles: Array<{ x: number; y: number; color: string }> = [
            // Target line handles
            { x: midX, y: targetY, color: "#29b57a" },
            { x: x1, y: targetY, color: "#29b57a" },
            { x: rightX, y: targetY, color: "#29b57a" },
            // Stop line handles
            { x: midX, y: stopY, color: "#e05263" },
            { x: x1, y: stopY, color: "#e05263" },
            { x: rightX, y: stopY, color: "#e05263" },
            // Entry line handles
            { x: midX, y: entryY, color: "#5fa8ff" },
            { x: x1, y: entryY, color: "#5fa8ff" },
            { x: rightX, y: entryY, color: "#5fa8ff" },
            // Horizontal boundary markers
            { x: x1, y: (targetY + stopY) / 2, color: "#5fa8ff" },
            { x: rightX, y: (targetY + stopY) / 2, color: "#5fa8ff" },
          ];

          for (const handle of handles) {
            context.beginPath();
            context.arc(handle.x, handle.y, handleRadius, 0, Math.PI * 2);
            context.fillStyle = "#ffffff";
            context.fill();
            context.lineWidth = Math.max(1.5, 1.5 * horizontalPixelRatio);
            context.strokeStyle = handle.color;
            context.stroke();
          }
        }

        context.restore();
      },
    );
  }
}

class PositionPaneView implements IPrimitivePaneView {
  private readonly paneRenderer: PositionPaneRenderer;

  constructor(
    coordinates: () => PositionCoordinates | null,
    drawing: () => PositionDrawing,
    isSelectedOrHovered: () => boolean,
  ) {
    this.paneRenderer = new PositionPaneRenderer(
      coordinates,
      drawing,
      isSelectedOrHovered,
    );
  }

  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paneRenderer;
  }
}

class PositionAxisView implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly coordinateValue: () => number | null,
    private readonly label: () => string,
    private readonly color: string,
  ) {}

  coordinate(): number {
    return this.coordinateValue() ?? -1_000;
  }

  text(): string {
    return this.label();
  }

  textColor(): string {
    return "#ffffff";
  }

  backColor(): string {
    return this.color;
  }

  visible(): boolean {
    return this.coordinateValue() !== null;
  }
}

export class PositionDrawingPrimitive implements ISeriesPrimitive<Time> {
  readonly id: string;
  private attachedParameters: SeriesAttachedParameter<Time> | null = null;
  private coordinates: PositionCoordinates | null = null;
  private drawingValue: PositionDrawing;
  private isSelected = false;
  private isHovered = false;
  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly priceAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(
    drawing: PositionDrawing,
    options?: { readonly selected?: boolean; readonly hovered?: boolean },
  ) {
    this.id = drawing.id;
    this.drawingValue = drawing;
    this.isSelected = options?.selected ?? Boolean(drawing.selected);
    this.isHovered = options?.hovered ?? Boolean(drawing.hovered);
    this.paneViewsValue = [
      new PositionPaneView(
        () => this.coordinates,
        () => this.drawingValue,
        () =>
          this.isSelected ||
          this.isHovered ||
          Boolean(this.drawingValue.selected || this.drawingValue.hovered),
      ),
    ];
    const coordinate = (level: "entryY" | "stopY" | "targetY") => () =>
      this.coordinates?.[level] ?? null;
    this.priceAxisViewsValue = [
      new PositionAxisView(coordinate("entryY"), () => "ENTRY", "#3977b8"),
      new PositionAxisView(coordinate("stopY"), () => "SL", "#b53f4c"),
      new PositionAxisView(coordinate("targetY"), () => "TP", "#21815c"),
    ];
  }

  setSelected(selected: boolean): void {
    if (this.isSelected !== selected) {
      this.isSelected = selected;
      this.attachedParameters?.requestUpdate();
    }
  }

  setHovered(hovered: boolean): void {
    if (this.isHovered !== hovered) {
      this.isHovered = hovered;
      this.attachedParameters?.requestUpdate();
    }
  }

  attached(parameters: SeriesAttachedParameter<Time>): void {
    this.attachedParameters = parameters;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParameters = null;
    this.coordinates = null;
  }

  update(
    drawing: PositionDrawing,
    options?: { readonly selected?: boolean; readonly hovered?: boolean },
  ): void {
    this.drawingValue = drawing;
    if (options?.selected !== undefined) {
      this.isSelected = options.selected;
    } else if (drawing.selected !== undefined) {
      this.isSelected = drawing.selected;
    }
    if (options?.hovered !== undefined) {
      this.isHovered = options.hovered;
    } else if (drawing.hovered !== undefined) {
      this.isHovered = drawing.hovered;
    }
    this.updateAllViews();
    this.attachedParameters?.requestUpdate();
  }

  updateAllViews(): void {
    const attached = this.attachedParameters;
    if (!attached) {
      this.coordinates = null;
      return;
    }
    const entryY = attached.series.priceToCoordinate(this.drawingValue.entry);
    const stopY = attached.series.priceToCoordinate(this.drawingValue.stopLoss);
    const targetY = attached.series.priceToCoordinate(
      this.drawingValue.takeProfit,
    );
    const visible = attached.chart.timeScale().getVisibleRange();
    const fallbackFrom =
      visible && typeof visible.from === "number" ? visible.from : null;
    const fallbackTo =
      visible && typeof visible.to === "number" ? visible.to : null;
    const fromTime = this.drawingValue.fromTimestamp
      ? toChartTimestamp(this.drawingValue.fromTimestamp)
      : fallbackFrom;
    const toTime = this.drawingValue.toTimestamp
      ? toChartTimestamp(this.drawingValue.toTimestamp)
      : fallbackTo;
    const x1 =
      fromTime === null
        ? null
        : attached.chart.timeScale().timeToCoordinate(fromTime);
    const x2 =
      toTime === null
        ? null
        : attached.chart.timeScale().timeToCoordinate(toTime);

    let finalX1 = x1;
    let finalX2 = x2;
    if (finalX1 === null && finalX2 !== null) {
      finalX1 = (finalX2 - 140) as unknown as typeof finalX1;
    } else if (finalX1 !== null && finalX2 === null) {
      finalX2 = (finalX1 + 140) as unknown as typeof finalX2;
    }

    this.coordinates =
      finalX1 === null ||
      finalX2 === null ||
      entryY === null ||
      stopY === null ||
      targetY === null
        ? null
        : { x1: finalX1, x2: finalX2, entryY, stopY, targetY };
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  priceAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.priceAxisViewsValue;
  }

  autoscaleInfo(): null {
    return null;
  }
}
