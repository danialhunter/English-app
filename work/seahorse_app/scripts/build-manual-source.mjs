import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "../../..");
const outputDirectory = path.join(projectDir, "work/manual_curriculum_source");
await fs.mkdir(outputDirectory, { recursive: true });

const csv = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
const topic = (name, sourcePages, items) => ({ name, sourcePages, items: Array.isArray(items) ? items : csv(items) });
const sentence = (text, kind, sourcePage) => ({ text, kind, sourcePage });

function numberWord(value) {
  const ones = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  if (value < 20) return ones[value];
  if (value < 100) return value % 10 ? `${tens[Math.floor(value / 10)]}-${ones[value % 10]}` : tens[value / 10];
  if (value === 100) return "one hundred";
  throw new Error(`Unsupported number ${value}`);
}

const vocabulary = {
  levels: [
    {
      id: "pre-nursery", name: "Pre-Nursery", ageBand: "2-3",
      topics: [
        topic("School life", [3], "hello, school, kindergarten, classroom, good morning, goodbye, bag, backpack, book, marker, brush, chair, table, door, scissors, glue, paper, playground"),
        topic("Things to wear", [3], "hat, shoes, socks, pants, coat"),
        topic("My family", [3], "father, mother, grandma, grandpa, brother, sister, baby, pets, dog, cat, bird, rabbit, home"),
        topic("Me and my body", [3], "head, face, hand, foot, eyes, ears, mouth, nose"),
        topic("Describing people", [3], "happy, sad, angry"),
        topic("Time", [3], "today, morning, afternoon"),
        topic("Weather", [3], "sunny, rainy, hot, cold, snow, rainbow, sun"),
        topic("Colors and shapes", [3], "red, yellow, green, blue, orange, pink, purple, black, white, brown, triangle, square, circle, star, heart, round"),
        topic("Numbers one to ten", [3], Array.from({ length: 10 }, (_, index) => numberWord(index + 1))),
        topic("Food", [4], "apple, banana, pear, strawberry, orange, watermelon, pizza, cake, cookies, bread, rice, noodles, chicken, fish, pumpkin, carrot, potato, egg, water, ice cream, milk, yummy, lollipop"),
        topic("Animals", [4], "elephant, monkey, tiger, lion, bear, snake, zebra, sheep, horse, fish, frog, dog, cat, duck, bird, butterfly, caterpillar, panda, shark, crocodile, dolphin, bee, pig, rabbit, cow, spider, turtle, dinosaur, zoo, sea, farm, tree, flower"),
        topic("Transports", [4], "plane, car, train, ship, bus, truck, bike, boat, wheels, fast, slow, up, down"),
        topic("Story time", [4], "princess, prince, monster, pirate, doctor, nurse, cold, fever, sick, medicine, bandage"),
        topic("Action words", [4], "open, close, like, love, walk, run, jump, hop, go, drink, eat, sleep, read, sing, dance, play, climb, push, pull, sit, stand, taste, smell, listen, talk, touch, draw, color"),
        topic("Describing words", [4, 5], "happy, sad, angry, great, yummy, big, small, fast, slow, sunny, rainy, hot, cold, red, yellow, green, blue, orange, pink, purple, black, white, brown")
      ]
    },
    {
      id: "nursery", name: "Nursery", ageBand: "3-4",
      topics: [
        topic("School life", [14, 15], "teacher, good afternoon, good evening, good night, see you, computer, keyboard, computer mouse, easel, picture, paints, pencil, whiteboard, floor, window, crayon, trash can, school bus, blocks, puzzle, clay, play dough, robot, carpet, knife, spoon, fork, plate, bowl, bottle, jar, cupboard"),
        topic("Things to wear", [15], "T-shirt, shorts, dress, watch, gloves, scarf, jacket, raincoat, sweater, pajamas, boots"),
        topic("My family", [15], "boy, girl, son, daughter, aunt, uncle, friend, twins"),
        topic("Me and my body", [15], "teeth, fingers, arm, leg, bottom, toes, thumb, neck, hair, chest"),
        topic("Describing people", [15], "naughty, quiet, nice, noisy, funny, strong, clever, scared"),
        topic("Time", [15], "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, evening, night, day, clock"),
        topic("Weather", [15], "cloudy, snowy, dry, wet, thunder and lightning, stormy, windy, foggy"),
        topic("Colors and shapes", [15], "grey, gold, silver, rectangle, oval, diamond, semicircle"),
        topic("Numbers ten to twenty", [15], Array.from({ length: 11 }, (_, index) => numberWord(index + 10))),
        topic("Food", [15], "grapes, pineapple, lemon, cherry, melon, dragon fruit, mango, coconut, peanut, raisin, blueberry, hamburger, sandwich, chips, pancake, cupcake, pasta, corn, green beans, broccoli, cabbage, cauliflower, tomato, mushroom, sweet, sour, spicy, juice, soya bean milk, cheese, butter, cream, yogurt, sugar, salt, flour, ketchup, ginger, sausage, doughnut, oil, soup, jellybean, marshmallow, fruit gum"),
        topic("Animals", [16], "donkey, peacock, goose, turkey, camel, zebra, hippo, eagle, gorilla, kangaroo, wolf, koala, deer, rhino, jellyfish, whale, crab, seahorse, starfish, octopus, snail, penguin, sea lion, seal, squirrel, dragonfly, fox, shell"),
        topic("Transports", [16], "police car, fire engine / fire truck, sports car, ambulance, motorcycle, bus stop, ticket, seat belt, traffic lights, zebra crossing, overhead bridge"),
        topic("Story time", [16], "witch, king, queen, castle, mermaid, dragon, tower, fairy"),
        topic("All sorts of places", [16], "forest, lake, river, desert, rock, bookshop, library, market, airport, hotel, museum, post office, police station, restaurant"),
        topic("Leisure", [16], "movie, piano, guitar, party, drum, camera, picture, park, sandpit, swing, slide, seesaw"),
        topic("Action words", [15], "roll, crawl, laugh, cry, smile, bend, brush, wash, stamp, clap, wave, touch, see, hear, put, tidy up / clean up, cross, pass, stop, slow down, speed up, throw, catch"),
        topic("Opposite and describing words", [15], "big, small, fat, thin, good, bad, happy, sad, hard, soft, heavy, light, old, young, slow, fast, short, long, tall, short, clean, dirty, quiet, noisy, hot, cold, safe, dangerous, hungry, kind, funny, clever, strong"),
        topic("How actions happen", [15], "very, slowly, loudly, nicely, quickly, up, down")
      ]
    },
    {
      id: "kindergarten-1", name: "Kindergarten 1", ageBand: "4-5",
      topics: [
        topic("School life", [23], "desk, ruler, eraser, cushion, beanbag, bookshelf, sharpener, glitter, journal, newsletter, clock, map, magnifying glass, palette, tape, globe, stapler, pins, highlighter, library, drama, science, music, creative art, mathematics, literacy, toy, doll, snack, lunch, bathroom, basket, tissue, tablet, speaker, scooter, bike, tricycle, wall"),
        topic("Things to wear", [23, 24], "shirt, vest, jeans, skirt, tights, jumper, slippers, boots, trousers, belt, sandals, hair bow, necklace, cap, helmet, purse, sunglasses, button, underwear"),
        topic("My family", [24], "cousin, nephew, niece, siblings, child, family, parents"),
        topic("Me and my body", [24], "eyebrow, eyelash, lip, chin, cheek, wrist, nail, ankle, roll, stretch, balance"),
        topic("Describing people", [24], "calm, worried, kind, hungry, surprised, lazy, confused, helpful, upset, excited, bored"),
        topic("Time", [24], "Spring, Summer, Autumn, Winter, week, weekend, yesterday, year"),
        topic("Weather", [24], "hail, frosty, breezy, tornado, hurricane, flood"),
        topic("Colors and shapes", [24], "pentagon, hexagon, cube, cylinder, arrow, cross"),
        topic("Numbers twenty to one hundred", [24], Array.from({ length: 81 }, (_, index) => numberWord(index + 20))),
        topic("Food", [24], "tangerine, peach, plum, cranberry, blackberry, avocado, papaya, lychee, kiwi, fruit, walnut, chestnut, date, wheat, oats, onion, pepper, cucumber, celery, lettuce, sweet potato, garlic, eggplant, honey, cereal, tuna, clam, lobster, lamb, beef, pork, ham, muffin, biscuit, frozen, fresh, bone, raw, bitter, flesh, root, rotten, juicy, core, ripe, snack bar, chewing gum, pie"),
        topic("Animals", [24, 25], "tadpole, goat, owl, seagull, jaguar, lizard, ostrich, flamingo, leopard, swan, clown fish, hedgehog, raccoon, walrus, pigeon, woodpecker, parrot, cricket, grasshopper, ladybug, worm, rooster, hen"),
        topic("Transports", [25], "racing car, concrete mixer, digger, scooter, skateboard, van, sailing boat, tram, double-decker, helicopter"),
        topic("All sorts of places", [25], "mountain, hill, island, volcano, sea, beach, rainforest, ocean, moon, earth, planet, cave, grassland, waterfall, train station, bus station, taxi station, subway, hospital, hotel, zoo, supermarket"),
        topic("Leisure", [25], "tent, torch, sleeping bag, camp, picnic, umbrella, raincoat, chess, board game, dominoes, collage"),
        topic("Jobs and work", [25], "baker, chef, fireman, policeman, doctor, nurse, painter, teacher, waiter, farmer"),
        topic("Around the house", [25], "bed, pillow, curtain, mirror, bathtub, shower, towel, oven, apron, napkin, television, sofa, mop, home, room, gate, floor, roof")
      ]
    },
    {
      id: "kindergarten-2", name: "Kindergarten 2", ageBand: "5-6",
      topics: [
        topic("School life", [32], "instruments, tambourine, xylophone, triangle, shake, cymbals, skipping rope, skating, basketball, football, balloon, goal, jungle gym, frisbee, magnet, balance scale, microscope, telescope, calculator, clips, drawing pins, hole puncher, stairs, hand rail, corridor, lobby, dining room, playground, baseball, paddling pool, swimming pool"),
        topic("Things to wear", [32], "bracelet, anklet, ring, earring, mitten, glasses, sneakers, trainers, crown, pocket, uniform"),
        topic("My family", [33], "husband, wife, married, grandson, granddaughter, children, man, woman"),
        topic("Me and my body", [33], "elbow, shoulders, knees, stomach, back, curly, straight, beard, moustache"),
        topic("Describing people", [33], "moody, greedy, graceful, confident, polite, clumsy"),
        topic("Time", [33], "January, February, March, April, May, June, July, August, September, October, November, December, tomorrow, month, time, tonight, future, birthday"),
        topic("Weather", [33], "snowstorm, light rain, moderate rain, heavy rain, showers, overcast"),
        topic("Colors and shapes", [33], "spot, spotted, stripe, striped"),
        topic("Numbers", [33], "zero, and, minus, equal"),
        topic("Food", [33], "bacon, steak, chop, quail egg, tuna, salmon, scallop, oyster, broad bean, bamboo, okra, spinach, radish, taro, cranberry, pomegranate, rosemary, mint, salad, canned drink, wrap, chicken nuggets, kebab, fish and chips, fried chicken, jam, porridge, waffles, meatballs, dinner, chopsticks"),
        topic("Animals", [33], "bat, sparrow, hummingbird, swallow, crow, bill, claw, scales, beetle, mosquito, fly, fur, wing, nest, wild, cage, kitten"),
        topic("Transports", [33, 34], "high-speed rail, railway, jet, rocket, spaceship, tractor, lift, taxi, traffic, passenger"),
        topic("All sorts of places", [34], "valley, cliff, coast, cactus, desert, cinema, village, skyscraper, square, factory, church, temple, Pacific Ocean, Atlantic Ocean, Indian Ocean, Arctic Ocean, Asia, Africa, North America, South America, Europe, Oceania, Antarctica, Arctic, continent, country, city, building, amusement park, aquarium, shopping mall, safari park"),
        topic("Leisure", [34], "stage, perform, performance, microphone, speaker, drama, graduation, ceremony, celebration, wish, gift, letter"),
        topic("Jobs and work", [34], "dentist, artist, musician, taxi driver, bus driver, astronaut, office worker, soldier, scientist, dancer, cashier, security guard, manager, businessman, librarian, singer, postman, actor, pop star, fire fighter, pilot"),
        topic("Around the house", [34], "drawer, lamp, mat, wardrobe, quilt, blanket, sheet, tap, toilet, sink, shampoo, comb, soap, cooker, refrigerator, fridge, wok, scales, baking tray, pan, chopsticks, rolling pin, ceiling, vase, broom, apartment, entrance, exit, hall, balcony, upstairs, downstairs"),
        topic("In the garden", [35], "wheelbarrow, watering can, lawn, hose, garden fork, spade, lawnmower, bark, soil, canes, fence, shed, lawn rake")
      ]
    }
  ]
};

const sentences = {
  levels: [
    {
      id: "pre-nursery", name: "Pre-Nursery", ageBand: "2-3",
      sentences: [
        sentence("What is your name? - My name is ___.", "Everyday question", 3),
        sentence("How are you today?", "Everyday question", 3),
        sentence("What’s the weather like today?", "Everyday question", 3),
        sentence("What is this? / Is this ...?", "Everyday question", 3),
        sentence("Can you ...?", "Everyday question", 3),
        sentence("Do you like ...? / What ... do you like?", "Everyday question", 3),
        sentence("Who is she / he?", "Everyday question", 3),
        sentence("How many ...?", "Everyday question", 3),
        sentence("Where is ...? - Here.", "Everyday question", 3),
        sentence("What is your favorite ...?", "Everyday question", 3),
        sentence("What can you see / hear?", "Everyday question", 3),
        sentence("What would you like to eat / drink?", "Everyday question", 3),
        sentence("Wash your hands.", "Daily instruction", 3),
        sentence("Brush your teeth.", "Daily instruction", 3),
        sentence("Let’s go to ...", "Daily instruction", 3),
        sentence("It’s clean up / circle / lunch / snack / play time.", "Daily instruction", 4),
        sentence("Circle time. Go to the carpet.", "Daily instruction", 4),
        sentence("Please sit on the mat.", "Daily instruction", 4),
        sentence("Please sit down / stand up.", "Daily instruction", 4),
        sentence("Come here / in.", "Daily instruction", 4),
        sentence("Line up please.", "Daily instruction", 4),
        sentence("Attention please.", "Daily instruction", 4),
        sentence("Put the toys away.", "Daily instruction", 4),
        sentence("Put the blocks in the box.", "Daily instruction", 4),
        sentence("Turn left / right / around.", "Daily instruction", 4),
        sentence("One by one please.", "Daily instruction", 4),
        sentence("No pushing / touching / talking.", "Daily instruction", 4),
        sentence("It’s your turn.", "Daily instruction", 4),
        sentence("Wait for your turn please.", "Daily instruction", 4),
        sentence("Hurry up / slow down.", "Daily instruction", 4),
        sentence("Be careful / watch out!", "Daily instruction", 4),
        sentence("Clap your hands.", "Daily instruction", 4)
      ]
    },
    {
      id: "nursery", name: "Nursery", ageBand: "3-4",
      sentences: [
        sentence("What is your name?", "Everyday question", 14),
        sentence("How are you? / How do you feel?", "Everyday question", 14),
        sentence("What’s the weather like today?", "Everyday question", 15),
        sentence("What day is it today?", "Everyday question", 15),
        sentence("What is this? / Is this ...?", "Everyday question", 15),
        sentence("Can you ...? / What can you do?", "Everyday question", 15),
        sentence("What ... do you like?", "Everyday question", 15),
        sentence("Who is she / he?", "Everyday question", 15),
        sentence("How many ...?", "Everyday question", 15),
        sentence("What is your favorite ...?", "Everyday question", 15),
        sentence("I like a funny book.", "Grammar example", 15),
        sentence("I walk fast.", "Grammar example", 15),
        sentence("Tony has a cat.", "Grammar example", 15),
        sentence("Subject-Verb (S-V): The dog plays.", "Sentence structure", 16),
        sentence("Subject-Verb-Object (S-V-O): I eat apples.", "Sentence structure", 16),
        sentence("Subject-Verb-Adjective (S-V-Adj): I am angry.", "Sentence structure", 16),
        sentence("Subject-Verb-Noun (S-V-N): I am a girl.", "Sentence structure", 16)
      ]
    },
    {
      id: "kindergarten-1", name: "Kindergarten 1", ageBand: "4-5",
      sentences: [
        sentence("Where are you going?", "Everyday question", 23),
        sentence("How do you go to ...?", "Everyday question", 23),
        sentence("What are you doing?", "Everyday question", 23),
        sentence("Where do you live?", "Everyday question", 23),
        sentence("Where is ...?", "Everyday question", 23),
        sentence("What do you want to do?", "Everyday question", 23),
        sentence("Why ...?", "Everyday question", 23),
        sentence("It’s my toy.", "Possessive adjective", 24),
        sentence("I like our school.", "Possessive adjective", 24),
        sentence("This is a zebra.", "Demonstrative", 24),
        sentence("It gets hot.", "Simple present", 25),
        sentence("It snows in the winter.", "Simple present", 25),
        sentence("It doesn’t snow in the summer.", "Simple present", 25),
        sentence("I build a house.", "Simple present", 25),
        sentence("We go to school by bus.", "Simple present", 25),
        sentence("You have four shells.", "Simple present", 25),
        sentence("They don’t have a pet.", "Simple present", 25),
        sentence("She needs a bag.", "Simple present", 25),
        sentence("He has a cap.", "Simple present", 25),
        sentence("He doesn’t have a cap.", "Simple present", 25),
        sentence("I am playing the drum.", "Present continuous", 25),
        sentence("She is dancing.", "Present continuous", 25),
        sentence("Subject-Verb (S-V): The telephone rings.", "Sentence structure", 25),
        sentence("Subject-Verb-Object (S-V-O): I brush my teeth.", "Sentence structure", 25),
        sentence("I comb my hair.", "Subject-Verb-Object", 25),
        sentence("I wash my face.", "Subject-Verb-Object", 25),
        sentence("I want to buy a toy.", "Subject-Verb-Object", 25),
        sentence("I want to play on the swing.", "Subject-Verb-Object", 25),
        sentence("I want to go down the slide.", "Subject-Verb-Object", 25),
        sentence("I have six dollars.", "Subject-Verb-Object", 25),
        sentence("Subject-Verb-Adjective (S-V-Adj): My doll is big and fat.", "Sentence structure", 26),
        sentence("Your dress is red.", "Subject-Verb-Adjective", 26),
        sentence("Subject-Verb-Noun (S-V-N): It is spring.", "Sentence structure", 26),
        sentence("There is a butterfly.", "Subject-Verb-Noun", 26),
        sentence("She is a baby.", "Subject-Verb-Noun", 26),
        sentence("This is your ball.", "Subject-Verb-Noun", 26),
        sentence("Subject-Verb-Adverb (S-V-Adv): Kate runs very fast.", "Sentence structure", 26),
        sentence("She laughs loudly.", "Subject-Verb-Adverb", 26),
        sentence("The birds fly high.", "Subject-Verb-Adverb", 26)
      ]
    },
    {
      id: "kindergarten-2", name: "Kindergarten 2", ageBand: "5-6",
      sentences: [
        sentence("Whose ... is this? / Who is / are ...?", "Everyday question", 32),
        sentence("What time is it?", "Everyday question", 32),
        sentence("What can you find ...? / What ... can we ...?", "Everyday question", 32),
        sentence("Which ... is ...? / Which one does ...?", "Everyday question", 32),
        sentence("Shall we ...?", "Everyday question", 32),
        sentence("Where are you going? / How do you go to ...?", "Everyday question", 32),
        sentence("How many ... are there?", "Everyday question", 32),
        sentence("How do we / you use ...?", "Everyday question", 32),
        sentence("What are you doing?", "Everyday question", 32),
        sentence("Where do you live?", "Everyday question", 33),
        sentence("Where is ...?", "Everyday question", 33),
        sentence("What do you want to do?", "Everyday question", 33),
        sentence("Why ...? / Why is ... important?", "Everyday question", 33),
        sentence("What is your name?", "Everyday question", 33),
        sentence("How are you today?", "Everyday question", 33),
        sentence("How do you feel?", "Everyday question", 33),
        sentence("What’s the weather like today?", "Everyday question", 33),
        sentence("What day is it today?", "Everyday question", 33),
        sentence("What is this? / Is this ...?", "Everyday question", 33),
        sentence("Can you ...? / Do you ...?", "Everyday question", 33),
        sentence("What ... do you like?", "Everyday question", 33),
        sentence("How many ...?", "Everyday question", 33),
        sentence("What is your favorite ...?", "Everyday question", 33),
        sentence("What can you do?", "Everyday question", 33),
        sentence("What would you like to eat / drink?", "Everyday question", 33),
        sentence("Would you like ...?", "Everyday question", 33),
        sentence("Wake up now!", "Imperative - direct command", 33),
        sentence("Watch out!", "Imperative - warning", 33),
        sentence("Don’t touch me!", "Imperative - prohibition", 33),
        sentence("Don’t throw rubbish into the sea!", "Imperative - prohibition", 33),
        sentence("Don’t eat too much!", "Imperative - advice", 33),
        sentence("Don’t do that!", "Imperative - advice", 33),
        sentence("Please don’t go.", "Imperative - request", 33),
        sentence("Please pass me the apple.", "Imperative - request", 33),
        sentence("Where is the eagle? / Where are the cats?", "Singular and plural", 34),
        sentence("Does she work in a school? Yes, she does. / Do they work in a school? Yes, they do.", "Singular and plural", 34),
        sentence("Do you have carrots? Yes, I do.", "Question and answer", 34),
        sentence("What does Tina have? She has a doll. / What do you have? I have a cat.", "Question and answer", 34),
        sentence("I have six dollars. You have four dollars. He has seven dollars.", "Pronoun agreement", 34),
        sentence("This is a zebra. / These are lions.", "Singular and plural", 34),
        sentence("You must tidy up here.", "Modal verb", 34),
        sentence("We have to save the polar bear.", "Modal verb", 34),
        sentence("You need to wash the toy.", "Modal verb", 34),
        sentence("I feel happy because I am with my friends.", "Conjunction", 35),
        sentence("Yesterday was Monday.", "Simple past", 35),
        sentence("They were very happy.", "Simple past", 35),
        sentence("Did you come to school by bus?", "Simple past", 35),
        sentence("I didn’t watch the TV.", "Simple past", 35),
        sentence("I will come to school tomorrow.", "Future tense", 35),
        sentence("She will not join us.", "Future tense", 35),
        sentence("I am going to play on the slide.", "Future tense", 35),
        sentence("He is not going to do it.", "Future tense", 35)
      ]
    }
  ]
};

const counts = {
  vocabularyByLevel: Object.fromEntries(vocabulary.levels.map((level) => [level.id, level.topics.reduce((sum, currentTopic) => sum + currentTopic.items.length, 0)])),
  sentencesByLevel: Object.fromEntries(sentences.levels.map((level) => [level.id, level.sentences.length]))
};
sentences.adaptationsForClassroomUse = [
  { sourcePage: 15, printed: "I like funny book.", used: "I like a funny book." },
  { sourcePage: 15, printed: "Tony have cat.", used: "Tony has a cat." },
  { sourcePage: 16, printed: "The dog play(s).", used: "The dog plays." },
  { sourcePage: 32, printed: "Which be/do...? Which one...is/do...?", used: "Which ... is ...? / Which one does ...?" },
  { sourcePage: 33, printed: "Why...? / Why...is important?", used: "Why ...? / Why is ... important?" },
  { sourcePage: 35, printed: "I am going to play slide.", used: "I am going to play on the slide." }
];
vocabulary.totals = { vocabulary: Object.values(counts.vocabularyByLevel).reduce((sum, count) => sum + count, 0), byLevel: counts.vocabularyByLevel };
sentences.totals = { sentences: Object.values(counts.sentencesByLevel).reduce((sum, count) => sum + count, 0), byLevel: counts.sentencesByLevel };

await Promise.all([
  fs.writeFile(path.join(outputDirectory, "vocabulary.json"), JSON.stringify(vocabulary, null, 2), "utf8"),
  fs.writeFile(path.join(outputDirectory, "sentences.json"), JSON.stringify(sentences, null, 2), "utf8"),
  fs.writeFile(path.join(outputDirectory, "counts.json"), JSON.stringify(counts, null, 2), "utf8")
]);
console.log(JSON.stringify(counts, null, 2));
