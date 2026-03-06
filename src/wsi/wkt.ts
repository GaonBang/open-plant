import type { WsiCoordinate, WsiMultiPolygonCoordinates, WsiPolygonCoordinates } from "./types";

export interface ParsedWktPolygon {
  type: "Polygon";
  coordinates: WsiPolygonCoordinates;
}

export interface ParsedWktMultiPolygon {
  type: "MultiPolygon";
  coordinates: WsiMultiPolygonCoordinates;
}

export type ParsedWktGeometry = ParsedWktPolygon | ParsedWktMultiPolygon;

function stripSridPrefix(value: string): string {
  return value.replace(/^\s*SRID\s*=\s*\d+\s*;\s*/i, "");
}

function isWordChar(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

function isDigitChar(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isNumberStartChar(ch: string): boolean {
  return ch === "+" || ch === "-" || ch === "." || isDigitChar(ch);
}

class WktParser {
  private readonly text: string;

  private index = 0;

  constructor(rawInput: string) {
    this.text = stripSridPrefix(rawInput.trim());
  }

  parse(): ParsedWktGeometry | null {
    if (!this.text) return null;

    const geometryType = this.readWord();
    if (!geometryType) return null;

    const geometryTypeUpper = geometryType.toUpperCase();
    if (geometryTypeUpper !== "POLYGON" && geometryTypeUpper !== "MULTIPOLYGON") {
      return null;
    }

    this.skipWhitespace();
    const maybeDimension = this.peekWord();
    if (maybeDimension) {
      const dimUpper = maybeDimension.toUpperCase();
      if (dimUpper === "Z" || dimUpper === "M" || dimUpper === "ZM") {
        this.readWord();
        this.skipWhitespace();
      }
    }

    if (this.consumeWordIf("EMPTY")) {
      this.skipWhitespace();
      if (!this.isEof()) return null;
      if (geometryTypeUpper === "POLYGON") {
        return { type: "Polygon", coordinates: [] };
      }
      return { type: "MultiPolygon", coordinates: [] };
    }

    let nested: unknown;
    try {
      nested = this.parseNestedList();
    } catch {
      return null;
    }

    this.skipWhitespace();
    if (!this.isEof()) return null;

    if (geometryTypeUpper === "POLYGON") {
      const polygon = toPolygonCoordinates(nested);
      if (!polygon) return null;
      return {
        type: "Polygon",
        coordinates: polygon,
      };
    }

    const multipolygon = toMultiPolygonCoordinates(nested);
    if (!multipolygon) return null;
    return {
      type: "MultiPolygon",
      coordinates: multipolygon,
    };
  }

  private isEof(): boolean {
    return this.index >= this.text.length;
  }

  private currentChar(): string {
    return this.text[this.index] ?? "";
  }

  private skipWhitespace(): void {
    while (!this.isEof() && /\s/.test(this.currentChar())) {
      this.index += 1;
    }
  }

  private readWord(): string | null {
    this.skipWhitespace();
    if (this.isEof()) return null;

    const start = this.index;
    while (!this.isEof() && isWordChar(this.currentChar())) {
      this.index += 1;
    }
    if (this.index === start) return null;
    return this.text.slice(start, this.index);
  }

  private peekWord(): string | null {
    const saved = this.index;
    const word = this.readWord();
    this.index = saved;
    return word;
  }

  private consumeWordIf(target: string): boolean {
    const saved = this.index;
    const word = this.readWord();
    if (!word || word.toUpperCase() !== target.toUpperCase()) {
      this.index = saved;
      return false;
    }
    return true;
  }

  private parseNestedList(): unknown[] {
    this.skipWhitespace();
    if (this.currentChar() !== "(") {
      throw new Error("Expected '('");
    }
    this.index += 1;

    const values: unknown[] = [];
    while (true) {
      this.skipWhitespace();
      if (this.currentChar() === "(") {
        values.push(this.parseNestedList());
      } else {
        values.push(this.parseCoordinateTuple());
      }

      this.skipWhitespace();
      const ch = this.currentChar();
      if (ch === ",") {
        this.index += 1;
        continue;
      }
      if (ch === ")") {
        this.index += 1;
        break;
      }
      throw new Error("Expected ',' or ')'");
    }

    return values;
  }

  private parseCoordinateTuple(): WsiCoordinate {
    this.skipWhitespace();
    const values: number[] = [];
    while (true) {
      this.skipWhitespace();
      const ch = this.currentChar();
      if (!ch || !isNumberStartChar(ch)) break;
      const num = this.readNumber();
      if (num === null) break;
      values.push(num);
      this.skipWhitespace();
      const next = this.currentChar();
      if (!next || next === "," || next === ")") break;
      if (!isNumberStartChar(next)) {
        throw new Error("Invalid coordinate");
      }
    }

    if (values.length < 2) {
      throw new Error("Coordinate requires at least x y");
    }
    return [values[0], values[1]];
  }

  private readNumber(): number | null {
    this.skipWhitespace();
    if (this.isEof()) return null;
    const chunk = this.text.slice(this.index);
    const match = chunk.match(/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/);
    if (!match) return null;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) return null;
    this.index += match[0].length;
    return value;
  }
}

function isCoordinate(value: unknown): value is WsiCoordinate {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function toPolygonCoordinates(value: unknown): WsiPolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const polygon: WsiPolygonCoordinates = [];
  for (const ringValue of value) {
    if (!Array.isArray(ringValue)) return null;
    const ring: WsiCoordinate[] = [];
    for (const coordValue of ringValue) {
      if (!isCoordinate(coordValue)) return null;
      ring.push([coordValue[0], coordValue[1]]);
    }
    polygon.push(ring);
  }
  return polygon;
}

function toMultiPolygonCoordinates(value: unknown): WsiMultiPolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const multipolygon: WsiMultiPolygonCoordinates = [];
  for (const polygonValue of value) {
    const polygon = toPolygonCoordinates(polygonValue);
    if (!polygon) return null;
    multipolygon.push(polygon);
  }
  return multipolygon;
}

export function parseWkt(wkt: string): ParsedWktGeometry | null {
  if (typeof wkt !== "string") return null;
  return new WktParser(wkt).parse();
}

