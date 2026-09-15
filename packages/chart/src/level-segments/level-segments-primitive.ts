import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

import type {
  LevelSegment,
  LevelSegmentsPresentationOptions,
} from "./types";

const DEFAULT_LEVEL_COLORS: Record<string, string> = {
  "call-wall": "#10b981",
  "put-wall": "#ef4444",
  "gamma-flip": "#3b82f6",
  "max-pain": "#f59e0b",
  "secondary-gex": "#8b5cf6",
  "confluence-zone": "#06b6d4",
};

interface ComputedSegmentCoord {
  readonly segment: LevelSegment;
  readonly y: number | null;
  readonly yTop: number | null;
  readonly yBottom: number | null;
  readonly startX: number;
  readonly isOffscreenRight: boolean;
}

class ConfluenceBandsRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getCoords: () => readonly ComputedSegmentCoord[],
    private readonly getPresentation: () => LevelSegmentsPresentationOptions,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coords = this.getCoords();
    const presentation = this.getPresentation();
    const defaultFillOpacity = presentation.confluenceFillOpacity ?? 0.14;

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
        for (const item of coords) {
          const { segment, yTop, yBottom, startX, isOffscreenRight } = item;
          if (segment.kind !== "confluence-zone" || yTop === null || yBottom === null || isOffscreenRight) {
            continue;
          }

          const y1 = Math.min(yTop, yBottom) * verticalPixelRatio;
          const y2 = Math.max(yTop, yBottom) * verticalPixelRatio;
          const h = Math.max(2 * verticalPixelRatio, y2 - y1);
          const x1 = Math.max(0, Math.round(startX * horizontalPixelRatio));
          const w = Math.max(0, bitmapSize.width - x1);

          if (w <= 0 || y2 < 0 || y1 > bitmapSize.height) continue;

          context.save();

          // Determine fill color
          let fillColor = "rgba(6, 182, 212, 0.12)";
          let borderColor = "rgba(6, 182, 212, 0.45)";

          if (segment.bias === "support") {
            fillColor = `rgba(16, 185, 129, ${defaultFillOpacity})`;
            borderColor = "rgba(16, 185, 129, 0.5)";
          } else if (segment.bias === "resistance") {
            fillColor = `rgba(239, 68, 68, ${defaultFillOpacity})`;
            borderColor = "rgba(239, 68, 68, 0.5)";
          } else if (segment.bias === "pivot") {
            fillColor = `rgba(139, 92, 246, ${defaultFillOpacity})`;
            borderColor = "rgba(139, 92, 246, 0.5)";
          } else if (segment.color) {
            fillColor = segment.color;
            borderColor = segment.color;
          }

          // Shaded band
          context.fillStyle = fillColor;
          context.fillRect(x1, y1, w, h);

          // Boundaries
          context.strokeStyle = borderColor;
          context.lineWidth = Math.max(1, horizontalPixelRatio);
          context.setLineDash([4 * horizontalPixelRatio, 3 * horizontalPixelRatio]);

          // Top line
          context.beginPath();
          context.moveTo(x1, y1);
          context.lineTo(bitmapSize.width, y1);
          context.stroke();

          // Bottom line
          context.beginPath();
          context.moveTo(x1, y2);
          context.lineTo(bitmapSize.width, y2);
          context.stroke();

          // Left start border (anchor boundary)
          if (x1 > 0) {
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(x1, y1);
            context.lineTo(x1, y2);
            context.stroke();
          }

          context.restore();
        }
      },
    );
  }
}

class LevelLinesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly getCoords: () => readonly ComputedSegmentCoord[],
    private readonly getPresentation: () => LevelSegmentsPresentationOptions,
  ) {}

  draw(target: Parameters<IPrimitivePaneRenderer["draw"]>[0]): void {
    const coords = this.getCoords();
    const presentation = this.getPresentation();
    const showPips = presentation.showPips ?? true;
    const pipRadius = presentation.pipRadius ?? 3;

    target.useBitmapCoordinateSpace(
      ({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
        for (const item of coords) {
          const { segment, y, startX, isOffscreenRight } = item;
          if (segment.kind === "confluence-zone" || y === null || isOffscreenRight) {
            continue;
          }

          const yPx = Math.round(y * verticalPixelRatio);
          if (yPx < -10 || yPx > bitmapSize.height + 10) continue;

          const x1 = Math.max(0, Math.round(startX * horizontalPixelRatio));
          const x2 = bitmapSize.width;
          if (x1 >= x2) continue;

          context.save();

          const color =
            segment.color ??
            DEFAULT_LEVEL_COLORS[segment.kind] ??
            "#94a3b8";
          const isPrimary = segment.importance !== "secondary";
          const rawWidth = segment.lineWidth ?? (isPrimary ? 1.5 : 1);
          const lineWidth = Math.max(1, rawWidth * horizontalPixelRatio);

          context.strokeStyle = color;
          context.lineWidth = lineWidth;

          if (segment.lineStyle === "dashed" || (!segment.lineStyle && !isPrimary)) {
            context.setLineDash([5 * horizontalPixelRatio, 4 * horizontalPixelRatio]);
          } else if (segment.lineStyle === "dotted") {
            context.setLineDash([2 * horizontalPixelRatio, 3 * horizontalPixelRatio]);
          } else {
            context.setLineDash([]);
          }

          context.beginPath();
          context.moveTo(x1, yPx);
          context.lineTo(x2, yPx);
          context.stroke();

          // Anchor shift pip at start coordinate
          if (showPips && x1 > 0) {
            context.setLineDash([]);
            context.fillStyle = color;
            context.beginPath();
            context.arc(
              x1,
              yPx,
              Math.max(2, pipRadius * horizontalPixelRatio),
              0,
              Math.PI * 2,
            );
            context.fill();
          }

          context.restore();
        }
      },
    );
  }
}

class ConfluenceBandsPaneView implements IPrimitivePaneView {
  constructor(private readonly rendererInstance: ConfluenceBandsRenderer) {}

  zOrder(): "bottom" {
    return "bottom";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.rendererInstance;
  }
}

class LevelLinesPaneView implements IPrimitivePaneView {
  constructor(private readonly rendererInstance: LevelLinesRenderer) {}

  zOrder(): "normal" {
    return "normal";
  }

  renderer(): IPrimitivePaneRenderer {
    return this.rendererInstance;
  }
}

export class LevelSegmentsPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | null = null;
  private segments: readonly LevelSegment[] = [];
  private presentation: LevelSegmentsPresentationOptions = {};
  private computedCoords: readonly ComputedSegmentCoord[] = [];

  private readonly confluenceRenderer: ConfluenceBandsRenderer;
  private readonly linesRenderer: LevelLinesRenderer;
  private readonly paneViewsValue: readonly IPrimitivePaneView[];

  constructor(
    segments: readonly LevelSegment[] = [],
    presentation: LevelSegmentsPresentationOptions = {},
  ) {
    this.segments = segments;
    this.presentation = presentation;

    this.confluenceRenderer = new ConfluenceBandsRenderer(
      () => this.computedCoords,
      () => this.presentation,
    );
    this.linesRenderer = new LevelLinesRenderer(
      () => this.computedCoords,
      () => this.presentation,
    );

    this.paneViewsValue = [
      new ConfluenceBandsPaneView(this.confluenceRenderer),
      new LevelLinesPaneView(this.linesRenderer),
    ];
  }

  attached(parameters: SeriesAttachedParameter<Time>): void {
    this.attachedParams = parameters;
    this.updateAllViews();
  }

  detached(): void {
    this.attachedParams = null;
    this.computedCoords = [];
  }

  updateSegments(
    segments: readonly LevelSegment[],
    presentation?: LevelSegmentsPresentationOptions,
  ): void {
    this.segments = segments;
    if (presentation) {
      this.presentation = presentation;
    }
    this.updateAllViews();
    this.attachedParams?.requestUpdate();
  }

  updateAllViews(): void {
    if (!this.attachedParams || this.segments.length === 0) {
      this.computedCoords = [];
      return;
    }

    const { chart, series } = this.attachedParams;
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    const coords: ComputedSegmentCoord[] = [];

    for (const segment of this.segments) {
      const y =
        Number.isFinite(segment.price) && segment.price > 0
          ? series.priceToCoordinate(segment.price)
          : null;

      let yTop: number | null = null;
      let yBottom: number | null = null;
      if (
        segment.priceHigh !== undefined &&
        segment.priceLow !== undefined &&
        Number.isFinite(segment.priceHigh) &&
        Number.isFinite(segment.priceLow)
      ) {
        yTop = series.priceToCoordinate(segment.priceHigh);
        yBottom = series.priceToCoordinate(segment.priceLow);
      }

      let startX = 0;
      let isOffscreenRight = false;

      if (
        segment.activationTimestamp !== null &&
        segment.activationTimestamp !== undefined &&
        Number.isFinite(segment.activationTimestamp) &&
        segment.activationTimestamp > 0
      ) {
        const utcSec = Math.floor(
          segment.activationTimestamp / 1000,
        ) as UTCTimestamp;
        const timeCoord = timeScale.timeToCoordinate(utcSec);

        if (timeCoord !== null) {
          startX = Math.max(0, timeCoord);
        } else if (visibleRange) {
          // If time is before visible window, it starts from left edge (0)
          const fromSec = Number(visibleRange.from);
          const toSec = Number(visibleRange.to);
          if (Number(utcSec) < fromSec) {
            startX = 0;
          } else if (Number(utcSec) > toSec) {
            isOffscreenRight = true;
          }
        }
      }

      coords.push({
        segment,
        y,
        yTop,
        yBottom,
        startX,
        isOffscreenRight,
      });
    }

    this.computedCoords = coords;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneViewsValue;
  }

  autoscaleInfo(): null {
    return null;
  }
}
