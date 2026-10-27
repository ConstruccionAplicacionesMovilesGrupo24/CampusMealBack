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

const V = DietaryTag.VEGETARIAN;
const VG = DietaryTag.VEGAN;
const GF = DietaryTag.GLUTEN_FREE;

function meal(
  name: string,
  price: number,
  ...dietaryTags: DietaryTag[]
): DemoMeal {
  return { name, price, dietaryTags };
}

// Note on the pre-existing five restaurants: their extra meals never undercut their cheapest
// VEGETARIAN meal (Green Bowl 17000, The Garden 14500, Sushi Rápido 20000) and the extra
// restaurants are all 3+ minutes of walking away, so the documented BQ4/BQ5 demo numbers
// (Walk to Green Bowl / The Garden) stay the same.

const DEMO_RESTAURANTS: DemoRestaurant[] = [
  {
    name: 'Green Bowl',
    category: 'Healthy',
    address: 'Calle 18A #1-10, Bogotá',
    latitude: 4.6021,
    longitude: -74.0658,
    // Wide hours (vs. #22 and #23 below) so this restaurant is reliably OPEN for demos
    // regardless of the time of day.
    openingHours: dailyHours(ALL_DAYS, '06:00', '23:00'),
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
      meal('Quinoa avocado bowl', 18500, V, GF),
      meal('Falafel wrap', 17500, V),
      meal('Mediterranean veggie plate', 19500, V, GF),
      meal('Grilled chicken salad', 21000, GF),
      meal('Salmon poke bowl', 26000, GF),
      meal('Tofu teriyaki bowl', 20500, VG),
      meal('Green detox smoothie', 9500, VG, GF),
      meal('Acai berry bowl', 16000, VG, GF),
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
      meal('Lentil stew menu', 15000, V),
      meal('Vegetable lasagna', 16000, V),
      meal('Baked salmon menu', 19500),
      meal('Beef stew menu', 16500),
      meal('Chicken and rice menu', 15500),
      meal('Daily soup', 7500, VG, GF),
      meal('Fruit salad', 6000, VG, GF),
      meal('Fresh lemonade', 4500, VG, GF),
    ],
  },
  {
    name: 'Andean Flavor',
    category: 'Business lunches',
    address: 'Carrera 4 #18-50, Bogotá',
    latitude: 4.6008,
    longitude: -74.0661,
    // Widened from evening-only (17:00-22:00) so this restaurant is reliably OPEN for demos
    // regardless of the time of day, while The Garden/Quinoa Corner still demonstrate CLOSED.
    openingHours: dailyHours(ALL_DAYS, '10:00', '23:00'),
    averageRating: 4.2,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 40,
    deliveryFee: 5000,
    meals: [
      { name: 'Ajiaco santafereño', price: 16000, dietaryTags: [] },
      { name: 'Bandeja paisa', price: 18000, dietaryTags: [] },
      meal('Vegetarian tamal', 18000, V),
      meal('Arepa with cheese', 16500, V),
      meal('Mondongo', 19000),
      meal('Sancocho de gallina', 20000),
      meal('Trout in garlic sauce', 24000, GF),
      meal('Chicharrón platter', 21000),
      meal('Empanadas (6 pack)', 12000),
      meal('Fresh fruit juice', 5000, VG, GF),
    ],
  },
  {
    name: 'Sushi Rápido',
    category: 'Japanese',
    address: 'Calle 19 #2-30, Bogotá',
    latitude: 4.6015,
    longitude: -74.064,
    // Widened from 11:30-21:00 so this restaurant is reliably OPEN for demos regardless of
    // the time of day.
    openingHours: dailyHours(ALL_DAYS, '10:00', '23:00'),
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
      meal('Avocado roll', 20500, V, VG),
      meal('Salmon nigiri set', 25000),
      meal('Tempura shrimp roll', 24000),
      meal('Teriyaki chicken bowl', 22000),
      meal('Tonkotsu ramen', 23000),
      meal('Gyoza (6 pieces)', 14000),
      meal('Miso soup', 7000),
      meal('Edamame', 8000, VG, GF),
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
      meal('Vegan buddha bowl', 14500, V, VG, GF),
      meal('Chickpea curry', 15000, V, VG, GF),
      meal('Chia pudding', 8000, V, VG, GF),
      meal('Whole-grain veggie sandwich', 12000, V),
      meal('Turkey and avocado wrap', 13500),
      meal('Green juice', 6500, VG, GF),
    ],
  },
  // ---- Extra catalog: all 3+ minutes of walking from the Uniandes campus (4.6025, -74.0653) ----
  {
    name: 'Café Candelaria',
    category: 'Café & bakery',
    address: 'Calle 19 #3-40, Bogotá',
    latitude: 4.6044,
    longitude: -74.0668,
    openingHours: dailyHours(ALL_DAYS, '07:00', '19:00'),
    averageRating: 4.5,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Avocado toast', 14000, V),
      meal('Croissant with ham and cheese', 11500),
      meal('Veggie bagel', 13000, V),
      meal('Chicken panini', 16500),
      meal('Granola bowl with fruit', 12500, V),
      meal('Cappuccino', 6500, V, GF),
      meal('Carrot cake slice', 9000, V),
      meal('Vegan brownie', 8500, V, VG),
    ],
  },
  {
    name: 'Pizza Piazza',
    category: 'Italian',
    address: 'Carrera 2 #17-25, Bogotá',
    latitude: 4.6003,
    longitude: -74.063,
    openingHours: dailyHours(ALL_DAYS, '11:00', '23:00'),
    averageRating: 4.3,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 40,
    deliveryFee: 5500,
    meals: [
      meal('Margherita pizza', 15500, V),
      meal('Pepperoni pizza', 19000),
      meal('Four cheese pizza', 20000, V),
      meal('Veggie supreme pizza', 21000, V),
      meal('Hawaiian pizza', 19500),
      meal('Garlic bread', 8000, V),
      meal('Caesar salad', 14000),
      meal('Tiramisu', 10000, V),
    ],
  },
  {
    name: 'Burger Boulevard',
    category: 'Burgers',
    address: 'Calle 22 #4-18, Bogotá',
    latitude: 4.605,
    longitude: -74.063,
    openingHours: dailyHours(ALL_DAYS, '11:00', '23:00'),
    averageRating: 4.1,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 42,
    deliveryFee: 6000,
    meals: [
      meal('Classic cheeseburger', 17500),
      meal('Double bacon burger', 23500),
      meal('Crispy chicken burger', 18500),
      meal('Plant-based burger', 21000, V, VG),
      meal('Veggie portobello burger', 19500, V),
      meal('Loaded fries', 11000, V),
      meal('Onion rings', 9500, V),
      meal('Chocolate milkshake', 10500, V),
    ],
  },
  {
    name: 'El Fogón Criollo',
    category: 'Colombian',
    address: 'Carrera 5 #16-70, Bogotá',
    latitude: 4.6012,
    longitude: -74.069,
    openingHours: dailyHours(ALL_DAYS, '11:30', '21:00'),
    averageRating: 4.6,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 45,
    deliveryFee: 5000,
    meals: [
      meal('Bandeja paisa completa', 26000),
      meal('Ajiaco con pollo', 21000),
      meal('Lechona with arepa', 19000),
      meal('Sobrebarriga a la plancha', 24000, GF),
      meal('Cazuela de frijoles', 20000),
      meal('Arroz con pollo', 17000),
      meal('Vegetarian lentil stew', 14500, V, VG),
      meal('Aguapanela con limón', 4000, V, VG, GF),
    ],
  },
  {
    name: 'Taco Libre',
    category: 'Mexican',
    address: 'Calle 24 #3-12, Bogotá',
    latitude: 4.606,
    longitude: -74.0645,
    openingHours: dailyHours(ALL_DAYS, '12:00', '23:00'),
    averageRating: 4.2,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 41,
    deliveryFee: 5000,
    meals: [
      meal('Al pastor tacos (3)', 16500),
      meal('Beef burrito', 19000),
      meal('Chicken quesadilla', 17000),
      meal('Veggie fajitas', 18500, V, GF),
      meal('Black bean tacos (3)', 15000, V, VG),
      meal('Nachos with guacamole', 13500, V, GF),
      meal('Elote (street corn)', 7500, V, GF),
      meal('Horchata', 6000, V, GF),
    ],
  },
  {
    name: 'Pho Saigón',
    category: 'Vietnamese',
    address: 'Carrera 1 #17-05, Bogotá',
    latitude: 4.5995,
    longitude: -74.0655,
    openingHours: dailyHours(ALL_DAYS, '11:00', '21:30'),
    averageRating: 4.4,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 39,
    deliveryFee: 4500,
    meals: [
      meal('Beef pho', 22000, GF),
      meal('Chicken pho', 20000, GF),
      meal('Vegetable pho', 18500, V, VG, GF),
      meal('Fresh spring rolls (4)', 12000, V, GF),
      meal('Bánh mì with pork', 17000),
      meal('Vegetarian bánh mì', 15500, V),
      meal('Vermicelli bowl', 19000),
      meal('Vietnamese iced coffee', 7500, V, GF),
    ],
  },
  {
    name: 'Arepa Express',
    category: 'Arepas',
    address: 'Calle 21 #1A-33, Bogotá',
    latitude: 4.6038,
    longitude: -74.062,
    openingHours: dailyHours(ALL_DAYS, '06:00', '22:00'),
    averageRating: 4.0,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Arepa de huevo', 6500, V),
      meal('Arepa with cheese', 7500, V),
      meal('Arepa rellena de pollo', 11500),
      meal('Arepa de carne desmechada', 12500),
      meal('Arepa vegetariana', 10000, V),
      meal('Chorizo with arepa', 9500),
      meal('Tinto', 2500, V, VG, GF),
      meal('Fresh orange juice', 5500, V, VG, GF),
    ],
  },
  {
    name: 'Veggie Garden Bistró',
    category: 'Vegetarian',
    address: 'Carrera 3 #17-60, Bogotá',
    latitude: 4.601,
    longitude: -74.062,
    openingHours: dailyHours(ALL_DAYS, '10:00', '21:00'),
    averageRating: 4.5,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 38,
    deliveryFee: 4000,
    meals: [
      meal('Lentil burger', 15500, V, VG),
      meal('Eggplant parmesan', 17500, V),
      meal('Veggie curry with rice', 14500, V, VG, GF),
      meal('Stuffed bell peppers', 16000, V, GF),
      meal('Mushroom risotto', 18500, V, GF),
      meal('Mediterranean bowl', 12000, V, VG, GF),
      meal('Zucchini noodles', 15000, V, VG, GF),
      meal('Hummus platter', 11000, V, VG),
      meal('Fresh berry smoothie', 8500, V, VG, GF),
    ],
  },
  {
    name: 'Pollo Dorado',
    category: 'Chicken',
    address: 'Calle 25 #5-14, Bogotá',
    latitude: 4.6065,
    longitude: -74.068,
    openingHours: dailyHours(ALL_DAYS, '11:00', '22:00'),
    averageRating: 3.9,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 40,
    deliveryFee: 4500,
    meals: [
      meal('Quarter roasted chicken', 15000, GF),
      meal('Half roasted chicken', 24000, GF),
      meal('Chicken wings (8)', 17500),
      meal('Crispy chicken tenders', 16500),
      meal('Chicken with fries combo', 18000),
      meal('Coleslaw', 5500, V, GF),
      meal('Potato wedges', 7500, V, VG),
      meal('Lemonade', 4500, V, VG, GF),
    ],
  },
  {
    name: 'Panadería La Esquina',
    category: 'Bakery',
    address: 'Carrera 5 #15-22, Bogotá',
    latitude: 4.6,
    longitude: -74.0678,
    openingHours: dailyHours(ALL_DAYS, '06:00', '18:00'),
    averageRating: 4.3,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Pan de bono (3)', 4500, V),
      meal('Almojábana', 3000, V),
      meal('Ham and cheese sandwich', 9500),
      meal('Cheese empanada', 3500, V),
      meal('Chicken pastry', 5500),
      meal('Fruit tart', 7500, V),
      meal('Hot chocolate with cheese', 7000, V),
      meal('Café con leche', 4000, V, GF),
    ],
  },
  {
    name: 'Wok & Roll',
    category: 'Asian',
    address: 'Calle 23 #6-10, Bogotá',
    latitude: 4.6048,
    longitude: -74.07,
    openingHours: dailyHours(ALL_DAYS, '11:00', '22:00'),
    averageRating: 4.1,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 43,
    deliveryFee: 5000,
    meals: [
      meal('Chicken fried rice', 17500),
      meal('Beef lo mein', 19500),
      meal('Vegetable stir-fry', 16000, V, VG),
      meal('Pad thai with shrimp', 21500),
      meal('Tofu pad thai', 18000, V, VG),
      meal('Sweet and sour chicken', 18500),
      meal('Spring rolls (4)', 9500, V),
      meal('Jasmine tea', 4500, V, VG, GF),
    ],
  },
  {
    name: 'Mediterráneo Fresh',
    category: 'Mediterranean',
    address: 'Carrera 7 #26-08, Bogotá',
    latitude: 4.6072,
    longitude: -74.066,
    openingHours: dailyHours(ALL_DAYS, '11:00', '20:00'),
    averageRating: 4.6,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Chicken shawarma plate', 22000),
      meal('Falafel plate', 18000, V, VG),
      meal('Greek salad', 15500, V, GF),
      meal('Hummus and pita', 12500, V, VG),
      meal('Lamb kofta', 26000, GF),
      meal('Stuffed grape leaves', 11000, V, VG, GF),
      meal('Tabbouleh', 10500, V, VG),
      meal('Baklava', 8500, V),
    ],
  },
  {
    name: 'Juice & Co.',
    category: 'Smoothies & snacks',
    address: 'Calle 20 #4-50, Bogotá',
    latitude: 4.603,
    longitude: -74.0685,
    openingHours: dailyHours(ALL_DAYS, '08:00', '19:00'),
    averageRating: 4.2,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Tropical smoothie', 9500, V, VG, GF),
      meal('Protein shake', 12500, V),
      meal('Fruit cup', 6500, V, VG, GF),
      meal('Açaí bowl', 15000, V, VG, GF),
      meal('Veggie wrap', 12500, V),
      meal('Turkey sandwich', 11500),
      meal('Energy bar', 4500, V, GF),
      meal('Cold brew coffee', 7000, V, VG, GF),
    ],
  },
  {
    name: 'Pasta Nonna',
    category: 'Italian',
    address: 'Carrera 2 #16-10, Bogotá',
    latitude: 4.599,
    longitude: -74.064,
    openingHours: dailyHours(ALL_DAYS, '12:00', '22:00'),
    averageRating: 4.5,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 44,
    deliveryFee: 5500,
    meals: [
      meal('Spaghetti bolognese', 19500),
      meal('Fettuccine alfredo', 20000, V),
      meal('Penne arrabbiata', 16500, V, VG),
      meal('Lasagna', 22000),
      meal('Ravioli with spinach and ricotta', 21000, V),
      meal('Gluten-free pasta primavera', 19000, V, GF),
      meal('Caprese salad', 13500, V, GF),
      meal('Panna cotta', 9000, V, GF),
    ],
  },
  {
    name: 'Parrilla Los Cerros',
    category: 'Grill',
    address: 'Calle 26 #2-90, Bogotá',
    latitude: 4.6055,
    longitude: -74.06,
    openingHours: dailyHours(ALL_DAYS, '12:00', '23:00'),
    averageRating: 4.4,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 45,
    deliveryFee: 6500,
    meals: [
      meal('Churrasco steak', 34000, GF),
      meal('Pork ribs', 32000, GF),
      meal('Grilled chicken breast', 24000, GF),
      meal('Mixed grill for one', 38000, GF),
      meal('Grilled vegetable skewers', 17500, V, VG, GF),
      meal('Grilled halloumi plate', 19500, V, GF),
      meal('Baked potato', 7500, V, GF),
      meal('House lemonade', 5000, V, VG, GF),
    ],
  },
  {
    name: 'Desayunos El Madrugador',
    category: 'Breakfast',
    address: 'Calle 18 #6-12, Bogotá',
    latitude: 4.602,
    longitude: -74.0705,
    // Morning-only on purpose: shows CLOSED for most of the day in the app.
    openingHours: dailyHours(ALL_DAYS, '05:30', '11:00'),
    averageRating: 4.3,
    deliveryAvailable: false,
    estimatedDeliveryMinutes: null,
    deliveryFee: null,
    meals: [
      meal('Huevos pericos with arepa', 9500, V),
      meal('Calentado paisa', 13500),
      meal('Pancakes with fruit', 11000, V),
      meal('Changua', 8500, V),
      meal('Tamal with chocolate', 12500),
      meal('Oatmeal with fruit', 7500, V, VG),
      meal('Orange juice', 4500, V, VG, GF),
    ],
  },
  {
    name: 'Cena Tardía',
    category: 'Late-night',
    address: 'Carrera 1 #19-42, Bogotá',
    latitude: 4.6008,
    longitude: -74.061,
    // Overnight interval (18:00 -> 02:00) to exercise the overnight opening-hours logic.
    openingHours: dailyHours(ALL_DAYS, '18:00', '02:00'),
    averageRating: 4.0,
    deliveryAvailable: true,
    estimatedDeliveryMinutes: 44,
    deliveryFee: 6000,
    meals: [
      meal('Hot dog with the works', 11500),
      meal('Late-night burrito', 15500),
      meal('Veggie burrito', 14000, V),
      meal('Loaded nachos', 13000, V, GF),
      meal('Chicken wrap', 14500),
      meal('Cheese quesadilla', 11000, V),
      meal('Churros with chocolate', 8500, V),
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
        // The restaurant itself is never modified, but any demo meal it is missing is added,
        // so growing a restaurant's menu in this file reaches already-seeded databases.
        let added = 0;
        for (const demoMeal of demo.meals) {
          const hasMeal = await meals.findOneBy({
            restaurantId: existing.id,
            name: demoMeal.name,
          });
          if (hasMeal) {
            continue;
          }
          await meals.save(
            meals.create({
              restaurantId: existing.id,
              name: demoMeal.name,
              price: demoMeal.price,
              dietaryTags: demoMeal.dietaryTags,
            }),
          );
          added += 1;
        }
        console.log(
          `[seed:restaurants] ${demo.name} already exists, restaurant left unchanged` +
            (added > 0 ? `, added ${added} missing meal(s)` : ''),
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
