import React from "react";
import { hubspot, Text } from "@hubspot/ui-extensions";

// Stub — iframe experiment concluded (HubSpot blocks inline external
// iframes by design). Card kept because removal requires UI confirmation;
// safe to delete from the project + record layouts whenever.
hubspot.extend(() => <Text variant="microcopy">Unused test card — safe to remove from this view.</Text>);
