import { Collection, Collections, Field } from "lib/types";

export class TypeBuilder {
  constructor(
    private collections: Collections,
    private useIntersectionTypes: boolean,
    private sdk11: boolean,
    private treatRequiredAsNonNull: boolean,
  ) {}

  build() {
    let ret = "";
    const types: string[] = [];

    for (const collection of Object.values(this.collections)) {
      const collectionName = collection.collection;
      const typeName = this.pascalCase(collectionName);
      const isSingleton = collection.meta?.singleton === true;

      types.push(
        this.sdk11
          ? `${collectionName}: ${typeName}${isSingleton ? "" : "[]"}`
          : `${collectionName}: ${typeName}`,
      );

      ret += this.collectionType(typeName, collection);
    }

    ret +=
      "export type CustomDirectusTypes = {\n" +
      types.map((x) => `  ${x};`).join("\n") +
      "\n};\n";

    return ret;
  }

  private collectionType(name: string, collection: Collection) {
    const types: string[] = [];

    for (const field of collection.fields) {
      if (this.isFieldPresentational(field)) continue;

      const identifier = field.field.includes("-")
        ? `"${field.field}"`
        : field.field;
      types.push(
        `${identifier}${field.schema?.is_nullable ? "?" : ""}: ${this.fieldType(field)};`,
      );
    }

    return (
      `export type ${name} = {\n` +
      types.map((x) => `  ${x};`).join("\n") +
      "};\n\n"
    );
  }

  private fieldType(field: Field) {
    let type = "";

    // Type of ID Field (in case relation isn't resolved via 'fields' query)
    switch (field.relation?.type) {
      case "many": {
        const relationIdField = this.collections[
          field.relation.collection
        ].fields.find((f) => f.field === "id")!;
        type = this.primitiveType(relationIdField) + "[]";
        break;
      }
      case "any": {
        // Many to any foreign keys are always strings
        type = "string";
        break;
      }
      case "any_type": {
        type += field.relation.collections
          .map((collection) => `"${this.pascalCase(collection)}"`)
          .join(" | ");
        break;
      }
      default: {
        type = this.primitiveType(field);
      }
    }

    // Type of related collection(s)
    if (field.relation && field.relation.type !== "any_type") {
      type += this.useIntersectionTypes ? " & " : " | ";

      if (field.relation.type === "any") {
        // m2a collections have multiple related types
        type += field.relation.collections.map(this.pascalCase).join(" | ");
      } else {
        type += field.relation.collection
          ? this.pascalCase(field.relation.collection)
          : "any";
        if (field.relation.type === "many") type += "[]";
      }
    }

    if (
      field.schema?.is_nullable &&
      !(this.treatRequiredAsNonNull && field.meta?.required)
    ) {
      if (field.relation && this.useIntersectionTypes) {
        type = `(${type}) | null`;
      } else {
        type += ` | null`;
      }
    }

    return type;
  }

  private isFieldPresentational(field: Field): boolean {
    if (field.meta?.interface == null) return false;
    return (
      field.meta?.interface.startsWith("presentation-") ||
      field.meta?.interface.startsWith("group-")
    );
  }

  private primitiveType(field: Field) {
    switch (field.type) {
      case "integer":
      case "bigInteger":
      case "float":
      case "decimal":
        return "number";
      case "boolean":
        return "boolean";
      case "json":
      case "csv":
        return "unknown";
      case "geometry.Point":
        return '{ type: "Point", coordinates: [number, number] }';
      case "geometry.MultiPoint":
        return '{ type: "MultiPoint", coordinates: [number, number][] }';
      case "geometry.LineString":
        return '{ type: "LineString", coordinates: [number, number][] }';
      case "geometry.MultiLineString":
        return '{ type: "MultiLineString", coordinates: [number, number][][] }';
      case "geometry.Polygon":
        return '{ type: "Polygon", coordinates: [number, number][][] }';
      case "geometry.MultiPolygon":
        return '{ type: "MultiPolygon", coordinates: [number, number][][][] }';
      default:
        return "string";
    }
  }

  private pascalCase(str: string) {
    return str
      .split(" ")
      .flatMap((x) => x.split("_"))
      .flatMap((y) => y.split("-"))
      .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
      .join("");
  }
}
