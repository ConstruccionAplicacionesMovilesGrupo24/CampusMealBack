import 'reflect-metadata';
import { DietaryTag } from '../../restaurants/enums/dietary-tag.enum';
import { Meal } from '../../restaurants/entities/meal.entity';
import { Restaurant } from '../../restaurants/entities/restaurant.entity';
import { OpeningPeriod } from '../../restaurants/opening-period';
import dataSource from '../data-source';

/**
 * Creates a small restaurant catalog near Universidad de los Andes
 * (npm run seed:restaurants). Idempotent: an existing restaurant (by name)
 * is reported and left untouched. Names match the mock data already used in
 * the Android and iOS UI prototypes, so the seeded catalog looks familiar
 * once the mobile clients switch from mocks to this API.
 */

interface DemoMeal {
  name: string;
  price: number;
  dietaryTags: DietaryTag[];
}

interface DemoRestaurant {
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  openingHours: OpeningPeriod[];
  averageRating: number;
  deliveryAvailable: boolean;
  estimatedDeliveryMinutes: number | null;
  deliveryFee: number | null;
  meals: DemoMeal[];
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

function dailyHours(
  days: number[],
  opensAt: string,
  closesAt: string,
): OpeningPeriod[] {
  return days.map((dayOfWeek) => ({ dayOfWeek, opensAt, closesAt }));
}

const DEMO_RESTAURANTS: DemoRestaurant[] = [
  {
    name: 'Green Bowl',
    category: 'Healthy',
    address: 'Calle 18A #1-10, Bogotá',
    latitude: 4.6021,
    longitude: -74.0658,
    openingHours: dailyHours(WEEKDAYS, '07:00', '20:00'),
    averageRating: 4.6,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 35,
    deliveryFee: 4500,
    meals: [
      { name: 'Vegetarian bowl', price: 17000, dietaryTags: [DietaryTag.VEGETARIAN] },
      {
        name: 'Vegan power bowl',
        price: 19000,
        dietaryTags: [DietaryTag.VEGAN, DietaryTag.GLUTEN_FREE],
      },
    ],
  },
  {
    name: 'The Garden',
    category: 'Home-style',
    address: 'Carrera 1 #19-20, Bogotá',
    latitude: 4.6032,
    longitude: -74.0649,
    openingHours: dailyHours(WEEKDAYS, '11:00', '15:30'),
    averageRating: 4.4,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      {
        name: "Today's vegetarian menu",
        price: 14500,
        dietaryTags: [DietaryTag.VEGETARIAN],
      },
      { name: 'Grilled chicken menu', price: 15500, dietaryTags: [] },
    ],
  },
  {
    name: 'Andean Flavor',
    category: 'Business lunches',
    address: 'Carrera 4 #18-50, Bogotá',
    latitude: 4.6008,
    longitude: -74.0661,
    openingHours: dailyHours(ALL_DAYS, '17:00', '22:00'),
    averageRating: 4.2,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 40,
    deliveryFee: 5000,
    meals: [
      { name: 'Ajiaco santafereño', price: 16000, dietaryTags: [] },
      { name: 'Bandeja paisa', price: 18000, dietaryTags: [] },
    ],
  },
  {
    name: 'Sushi Rápido',
    category: 'Japanese',
    address: 'Calle 19 #2-30, Bogotá',
    latitude: 4.6015,
    longitude: -74.064,
    openingHours: dailyHours(ALL_DAYS, '11:30', '21:00'),
    averageRating: 4.2,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 30,
    deliveryFee: 4000,
    meals: [
      { name: 'California roll combo', price: 22000, dietaryTags: [] },
      {
        name: 'Vegetable roll combo',
        price: 20000,
        dietaryTags: [DietaryTag.VEGETARIAN, DietaryTag.VEGAN],
      },
    ],
  },
  {
    name: 'Quinoa Corner',
    category: 'Healthy',
    address: 'Calle 20 #3-15, Bogotá',
    latitude: 4.6041,
    longitude: -74.0672,
    openingHours: dailyHours(WEEKDAYS, '08:00', '16:00'),
    averageRating: 4.0,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      {
        name: 'Quinoa salad',
        price: 13000,
        dietaryTags: [DietaryTag.VEGAN, DietaryTag.GLUTEN_FREE],
      },
    ],
  },
];

async function seed(): Promise<void> {
  await dataSource.initialize();
  try {
    const restaurants = dataSource.getRepository(Restaurant);
    const meals = dataSource.getRepository(Meal);

    for (const demo of DEMO_RESTAURANTS) {
      const existing = await restaurants.findOneBy({ name: demo.name });
      if (existing) {
        console.log(
          `[seed:restaurants] ${demo.name} already exists, left unchanged`,
        );
        continue;
      }

      const restaurant = await restaurants.save(
        restaurants.create({
          name: demo.name,
          category: demo.category,
          address: demo.address,
          latitude: demo.latitude,
          longitude: demo.longitude,
          openingHours: demo.openingHours,
          averageRating: demo.averageRating,
          deliveryAvailable: demo.deliveryAvailable,
          estimatedDeliveryMinutes: demo.estimatedDeliveryMinutes,
          deliveryFee: demo.deliveryFee,
        }),
      );

      for (const meal of demo.meals) {
        await meals.save(
          meals.create({
            restaurantId: restaurant.id,
            name: meal.name,
            price: meal.price,
            dietaryTags: meal.dietaryTags,
          }),
        );
      }

      console.log(
        `[seed:restaurants] created ${demo.name} with ${demo.meals.length} meal(s)`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
