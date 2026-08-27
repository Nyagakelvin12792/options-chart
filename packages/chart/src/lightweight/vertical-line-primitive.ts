import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

interface VerticalLinePrimitiveOptions {
  readonly id: string;
  readonly timestamp: number;
  readonly color: string;
  readonly label: string;
}

class VerticalLineRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly coordinate: () => number | null,
    private readonly color: string,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coordinate = this.coordinate();
    if (coordinate === null) {
      return;
    }

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, bitmapSize }) => {
        const x = Math.round(coordinate * horizontalPixelRatio);
        context.save();
        context.strokeStyle = this.color;
        context.lineWidth = Math.max(1, horizontalPixelRatio);
        context.setLineDash([
          5 * horizontalPixelRatio,
          4 * horizontalPixelRatio,
        ]);
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, bitmapSize.height);
        context.stroke();
        context.restore();
      },
    );
  }
}

class VerticalLinePaneView implements IPrimitivePaneView {
  private readonly paneRenderer: VerticalLineRenderer;

  constructor(coordinate: () => number | null, color: string) {
    this.paneRenderer = new VerticalLineRenderer(coordinate, color);
  }

  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.paneRenderer;
  }
}

class VerticalLineTimeAxisView implements ISeriesPrimitiveAxisView {
  constructor(
    private readonly coordinateValue: () => number | null,
    private readonly label: string,
    private readonly color: string,
  ) {}

  coordinate(): number {
    return this.coordinateValue() ?? -1_000;
  }

  text(): string {
    return this.label;
  }

  textColor(): string {
    return "#f4f7fa";
  }

  backColor(): string {
    return this.color;
  }

  visible(): boolean {
    return this.coordinateValue() !== null;
  }
}

export class VerticalLinePrimitive implements ISeriesPrimitive<Time> {
  readonly id: string;

  private attachedParameters: SeriesAttachedParameter<Time> | null = null;
  private coordinate: number | null = null;
  private readonly timestamp: UTCTimestamp;
  private readonly paneViewsValue: readonly IPrimitivePaneView[];
  private readonly timeAxisViewsValue: readonly ISeriesPrimitiveAxisView[];

  constructor(options: VerticalLinePrimitiveOptions) {
    this.id = options.id;
    this.timestamp = Math.floor(options.timestamp / 1_000) as UTCTimestamp;
    const getCoordinate = () => this.coordinate;
    this.paneViewsValue = [
      new VerticalLinePaneView(getCoordinate, options.color),
    ];
    this.timeAxisViewsValue = [
      new VerticalLineTimeAxisView(getCoordinate, options.label, options.color),
    ];
  }

  attached(parameters: SeriesAttachedParameter<Time>): void {
    this.attachedParameters = parameters;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParameters = null;
    this.coordinate = null;
  }

  updateAllViews(): void {
    this.coordinate =
      this.attachedParameters?.chart
        .timeScale()
        .timeToCoordinate(this.timestamp) ?? null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  timeAxisViews(): readonly ISeriesPrimitiveAxisView[] {
    return this.timeAxisViewsValue;
  }
}
