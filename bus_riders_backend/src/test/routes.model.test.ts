import Routes from "@/models/Bus/routes";

function buildBaseRoutePayload() {
  return {
    name: "Route Test",
    number: "R-TEST-01",
    direction: "FORWARD",
    start_point: {
      type: "Point",
      coordinates: [[-79.5199, 8.9824]],
    },
    end_point: {
      type: "Point",
      coordinates: [[-79.5205, 8.9839]],
    },
    route: {
      type: "LineString",
      coordinates: [
        [-79.5199, 8.9824],
        [-79.5202, 8.9831],
        [-79.5205, 8.9839],
      ],
    },
  };
}

describe("bu_routes model end_zone validation", () => {
  test("accepts valid end_zone polygon", () => {
    const model = new Routes({
      ...buildBaseRoutePayload(),
      end_zone: {
        type: "Polygon",
        coordinates: [
          [-79.5205, 8.9839],
          [-79.5204, 8.9840],
          [-79.5206, 8.9840],
          [-79.5205, 8.9839],
        ],
      },
    });

    const error = model.validateSync();
    expect(error).toBeUndefined();
  });

  test("rejects end_zone polygon with less than 3 points", () => {
    const model = new Routes({
      ...buildBaseRoutePayload(),
      end_zone: {
        type: "Polygon",
        coordinates: [
          [-79.5205, 8.9839],
          [-79.5204, 8.9840],
        ],
      },
    });

    const error = model.validateSync();
    expect(error).toBeDefined();
    expect(error?.errors?.["end_zone.coordinates"]).toBeDefined();
  });

  test("rejects invalid end_zone type", () => {
    const model = new Routes({
      ...buildBaseRoutePayload(),
      end_zone: {
        type: "Point",
        coordinates: [[-79.5205, 8.9839]],
      },
    });

    const error = model.validateSync();
    expect(error).toBeDefined();
    expect(error?.errors?.["end_zone.type"]).toBeDefined();
  });

  test("accepts routes without end_zone", () => {
    const model = new Routes(buildBaseRoutePayload());

    const error = model.validateSync();
    expect(error).toBeUndefined();
  });
});
