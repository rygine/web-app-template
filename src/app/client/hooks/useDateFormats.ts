import { getRouteApi } from "@tanstack/react-router";

const shell = getRouteApi("__root__");

// The stored date formats, read from the root loader by whichever leaf renders
// a date, so no page threads them down as props.
export const useDateFormats = () => shell.useLoaderData();
