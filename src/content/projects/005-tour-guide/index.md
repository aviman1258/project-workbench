---
id: "005"
slug: tour-guide
name: Deodapper.com
description: Deodapper (https://www.deodapper.com) plans a self-guided driving day between two places — say an airport and a hotel — picking stops around the traveler's interests, timing them against a check-in or departure, and writing short spoken narrations for each one and for interesting things passed along the way. It is used either as a free "take a ready-made tour" experience built from a shared library of previously published routes, or as a paid, AI-generated custom route (from $1.99, priced by trip length) created by Claude from Wikipedia, OpenStreetMap and web research. Once planned, the route is saved as an installable offline web app ("drive mode") that follows the driver by GPS, narrates stops through the phone's own text-to-speech, and gives turn-by-turn spoken directions.
why: "I built Deodapper because the dead hours between landing somewhere and getting to a hotel — or any long point-to-point drive — are usually wasted or spent guessing at detours with no real guide in the car. I wanted to see if an AI model could do the work a human tour guide does: picking worthwhile stops that match what someone actually cares about, fitting them into a real time budget, and narrating them well enough to listen to while driving, hands-free. It's a personal project (my first real trip with it was Houston, November 2026), and it let me work through a genuinely full-stack problem end to end: geocoding and routing, LLM-driven planning under a cost budget, Stripe payments with manual-capture holds, a shared content library with moderation, GPS-triggered narration, and a PWA that has to keep working with a flaky signal in a moving car."
status: delivered
privacy: public
startDate: 2026-09-09
updatedDate: 2026-10-06
repositoryUrl: https://github.com/aviman1258/tour-guide
siteUrl: https://www.deodapper.com
artifactOrder:
  - page-home.png
  - page-plan-html.png
  - page-routes.png
  - page-drive-html.png
  - page-terms-html.png
  - page-privacy-html.png
  - page-index-html.png
  - how-it-works.pdf
featuredArtifact: page-home.png
---
