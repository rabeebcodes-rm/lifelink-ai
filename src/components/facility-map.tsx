import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { Coordinates, Place } from "@/services/places";

type FacilityMapProps = {
  location: Coordinates;
  places: Place[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

function FitResults({ location, places }: Pick<FacilityMapProps, "location" | "places">) {
  const map = useMap();

  useEffect(() => {
    const points: [number, number][] = [
      [location.lat, location.lon],
      ...places.map((place) => [place.lat, place.lon] as [number, number]),
    ];
    if (points.length > 1) {
      map.fitBounds(points, { padding: [28, 28], maxZoom: 14 });
    } else {
      map.setView(points[0], 13);
    }
  }, [map, location.lat, location.lon, places]);

  return null;
}

export function FacilityMap({
  location,
  places,
  selectedId,
  onSelect,
}: FacilityMapProps) {
  const [tileError, setTileError] = useState(false);
  return (
    <div className="live-map-wrapper">
      <MapContainer
        center={[location.lat, location.lon]}
        zoom={12}
        scrollWheelZoom
        className="live-map"
        aria-label="Interactive map of OpenStreetMap healthcare facilities"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ tileerror: () => setTileError(true), load: () => setTileError(false) }}
        >
        </TileLayer>
        <FitResults location={location} places={places} />
        <CircleMarker
          center={[location.lat, location.lon]}
          radius={8}
          pathOptions={{ color: "#fff", weight: 3, fillColor: "#168ba1", fillOpacity: 1 }}
        >
          <Popup>{location.label}</Popup>
        </CircleMarker>
        {places.map((place) => (
          <CircleMarker
            key={place.id}
            center={[place.lat, place.lon]}
            radius={selectedId === place.id ? 10 : 7}
            pathOptions={{
              color: "#fff",
              weight: 2,
              fillColor: selectedId === place.id ? "#e44545" : "#123b5d",
              fillOpacity: 0.95,
            }}
            eventHandlers={{ click: () => onSelect(place.id) }}
          >
            <Popup>
              <strong>{place.name}</strong>
              <br />
              {place.kind}
              <br />
              {place.address}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {tileError && (
        <div className="map-tile-error" role="status">
          Map tiles are unavailable. Facility results are still listed below.{" "}
          <a
            href={`https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lon}#map=14/${location.lat}/${location.lon}`}
            target="_blank"
            rel="noreferrer"
          >
            Open the external map
          </a>
        </div>
      )}
    </div>
  );
}
