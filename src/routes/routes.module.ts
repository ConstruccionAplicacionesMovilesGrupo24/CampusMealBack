import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration } from '../config/configuration';
import {
  ROUTE_PROVIDER_PORT,
  RouteProviderPort,
} from './domain/route-provider.port';
import { DeterministicRouteAdapter } from './infrastructure/deterministic-route.adapter';
import { ExternalRouteAdapter } from './infrastructure/external-route.adapter';

@Module({
  providers: [
    {
      provide: ROUTE_PROVIDER_PORT,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<Configuration, true>,
      ): RouteProviderPort => {
        const routeProvider = config.get('routeProvider', { infer: true });

        if (routeProvider.mode === 'external') {
          if (!routeProvider.url) {
            throw new Error(
              'ROUTE_PROVIDER_URL is required when ROUTE_PROVIDER_MODE=external',
            );
          }
          return new ExternalRouteAdapter({
            url: routeProvider.url,
            apiKey: routeProvider.apiKey,
            timeoutMs: routeProvider.timeoutMs,
          });
        }

        return new DeterministicRouteAdapter();
      },
    },
  ],
  exports: [ROUTE_PROVIDER_PORT],
})
export class RoutesModule {}
