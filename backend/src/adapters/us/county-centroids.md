`county-centroids.json` maps 5-digit US county FIPS codes (as used by NWS `geocode.SAME`) to `[latitude, longitude]` internal points.

Source: U.S. Census Bureau, 2023 Gazetteer Files (counties, national). Public domain.
https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip

Used only to place NWS zone/county-based alerts that carry no polygon geometry. Such hazards are flagged `locationPrecision: "approximate"`.
