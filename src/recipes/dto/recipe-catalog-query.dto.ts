/**
 * Contract version 1 accepts no query parameters. Binding this empty class with @Query() makes
 * the global ValidationPipe (whitelist + forbidNonWhitelisted) reject any parameter with
 * 400 VALIDATION_ERROR instead of silently ignoring it.
 */
export class RecipeCatalogQueryDto {}
