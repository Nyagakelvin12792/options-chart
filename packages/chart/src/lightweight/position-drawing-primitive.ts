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
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coordinates = this.coordinates();
    if (!coordinates) return;
    const drawing = this.drawing();
    const riskPercent =
      (Math.abs(drawing.entry - drawing.stopLoss) / drawing.entry) * 100;
    const rewardPercent =
      (Math.abs(drawing.takeProfit - drawing.entry) / drawing.entry) * 100;
    const rewardRisk = positionRewardRiskRatio(drawing);

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio }) => {
        const x1 =
          Math.min(coordinates.x1, coordinates.x2) * horizontalPixelRatio;
        const x2 =
          Math.max(coordinates.x1, coordinates.x2) * horizontalPixelRatio;
        const width = Math.max(72 * horizontalPixelRatio, x2 - x1);
        const entryY = coordinates.entryY * verticalPixelRatio;
        const stopY = coordinates.stopY * verticalPixelRatio;
        const targetY = coordinates.targetY * verticalPixelRatio;
        const targetTop = Math.min(entryY, targetY);
        const stopTop = Math.min(entryY, stopY);

        context.save();
        context.fillStyle = "rgba(37, 169, 119, 0.16)";
        context.fillRect(x1, targetTop, width, Math.abs(targetY - entryY));
        context.fillStyle = "rgba(220, 83, 98, 0.17)";
        context.fillRect(x1, stopTop, width, Math.abs(stopY - entryY));

        const drawLine = (y: number, color: string, dashed = false) => {
          context.strokeStyle = color;
          context.lineWidth = Math.max(1, horizontalPixelRatio);
          context.setLineDash(
            dashed ? [4 * horizontalPixelRatio, 3 * horizontalPixelRatio] : [],
          );
          context.beginPath();
          context.moveTo(x1, y);
          context.lineTo(x1 + width, y);
          context.stroke();
        };
        drawLine(targetY, "#29b57a", true);
        drawLine(stopY, "#e05263", true);
        drawLine(entryY, "#5fa8ff");

        context.setLineDash([]);
        context.font = `${11 * verticalPixelRatio}px Arial, sans-serif`;
        context.textBaseline = "middle";
        const labelX = x1 + 7 * horizontalPixelRatio;
        context.fillStyle = "#dce7f0";
        context.fillText(
          `${drawing.direction.toUpperCase()}  ${rewardRisk.toFixed(2)}R`,
          labelX,
          entryY - 10 * verticalPixelRatio,
        );
        context.fillStyle = "#66d6a3";
        context.fillText(
          `TP +${rewardPercent.toFixed(2)}%`,
          labelX,
          targetY + (targetY < entryY ? 11 : -11) * verticalPixelRatio,
        );
        context.fillStyle = "#ff7d8a";
        context.fillText(
          `SL -${riskPercent.toFixed(2)}%`,
          labelX,
          stopY + (stopY > entryY ? -11 : 11) * verticalPixelRatio,
        );
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
  ) {
    this.paneRenderer = new PositionPaneRenderer(coordinates, drawing);
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
  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly priceAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(drawing: PositionDrawing) {
    this.id = drawing.id;
    this.drawingValue = drawing;
    this.paneViewsValue = [
      new PositionPaneView(
        () => this.coordinates,
        () => this.drawingValue,
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

  attached(parameters: SeriesAttachedParameter<Time>): void {
    this.attachedParameters = parameters;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParameters = null;
    this.coordinates = null;
  }

  update(drawing: PositionDrawing): void {
    this.drawingValue = drawing;
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
    this.coordinates =
      x1 === null ||
      x2 === null ||
      entryY === null ||
      stopY === null ||
      targetY === null
        ? null
        : { x1, x2, entryY, stopY, targetY };
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
