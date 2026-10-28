import { Image } from "expo-image";
import { StyleSheet, View, useWindowDimensions } from "react-native";

import { theme } from "@/shared/theme";
import { plateFoodImages } from "../plateImages";

type FoodPlateProps = {
  selectedFoodTypes?: string[];
};

type FoodId = keyof typeof plateFoodImages;

 // Use a stable order around the plate.
const foodOrder: FoodId[] = [
  "healthy",
  "bakery",
  "grills",
  "seafood",
  "breakfast",
  "sandwiches",
];

// Center X, center Y, size (%), and rotation (degrees).
type PortionPosition = [number, number, number, number];

// Balance the portions for each number of choices.
const portionLayouts: Record<number, PortionPosition[]> = {
  1: [[50, 50, 60, 0]],

  2: [
    [37, 43, 49, -6],
    [63, 57, 49, 6],
  ],

  3: [
    [34, 40, 47, -5],
    [64, 36, 44, 5],
    [52, 65, 47, 0],
  ],

  4: [
    [35, 33, 39, -5],
    [65, 37, 39, 5],
    [64, 65, 39, -4],
    [34, 65, 39, 4],
  ],

  5: [
    [36, 31, 35, -4],
    [65, 35, 36, 5],
    [68, 61, 36, -4],
    [46, 70, 36, 3],
    [30, 53, 36, -5],
  ],

  6: [
    [34, 31, 37, -5],
    [62, 29, 38, 3],
    [66, 47, 35, 4],
    [60, 66, 39, -5],
    [36, 68, 35, 4],
    [32, 49, 37, -5],
  ],
};
// Reuse the same artwork for both plates.
const plateImage = require(
  "../../../../assets/images/preferences/plate.png"
);

// Use overhead images only in the table preview.
const coffeeTeaImage = require(
  "../../../../assets/images/preferences/table/coffee-tea.png"
);

const juiceImage = require(
  "../../../../assets/images/preferences/table/juices.png"
);

export function FoodPlate({
  selectedFoodTypes = [],
}: FoodPlateProps) {
  const { width } = useWindowDimensions();

 // Keep selected food in the same visual order.
const selectedFoods = foodOrder.filter((id) =>
  selectedFoodTypes.includes(id)
);

  const hasDessert = selectedFoodTypes.includes("desserts");
  const hasCoffeeTea = selectedFoodTypes.includes("coffee-tea");
  const hasJuice = selectedFoodTypes.includes("juices");

  // Separate dessert when other food is selected.
  const dessertOnSide = hasDessert && selectedFoods.length > 0;

  const hasSideItems = dessertOnSide || hasCoffeeTea || hasJuice;

  // Fit the whole setting inside the page.
  const sceneSize = Math.max(
    1,
    Math.min(320, width - theme.spacing.pagePadding * 2)
  );

  const plateSize = sceneSize * 0.72;

  // Leave space around the plate for the side items.
  const plateLeft = sceneSize * (hasSideItems ? 0.24 : 0.14);
  const plateTop = hasSideItems ? sceneSize * 0.16 : 0;

  // Avoid extra empty space when only the main plate is shown.
  const sceneHeight = hasSideItems ? sceneSize : plateSize;

  const dessertSize = sceneSize * 0.32;
  const coffeeTeaSize = sceneSize * 0.34;
  const juiceSize = sceneSize * 0.22;

  const positions = portionLayouts[selectedFoods.length] ?? [];

  return (
    <View
      pointerEvents="none"
      style={[
        styles.scene,
        {
          width: sceneSize,
          height: sceneHeight,
        },
      ]}
    >
      {/* Draw the main plate. */}
      <Image
        source={plateImage}
        style={[
          styles.image,
          {
            left: plateLeft,
            top: plateTop,
            width: plateSize,
            height: plateSize,
          },
        ]}
        contentFit="contain"
        accessible={false}
      />

    {/* Place each portion around its center. */}
{selectedFoods.map((id, index) => {
  const position = positions[index];
  if (!position) return null;

  const [centerX, centerY, size, rotation] = position;

  // Make bread smaller when served with other food.
  const portionSize =
    id === "bakery" && selectedFoods.length > 1
      ? size * 0.72
      : size;

  // Convert the center into the image's top-left corner.
  const left = centerX - portionSize / 2;
  const top = centerY - portionSize / 2;

  return (
    <Image
      key={id}
      source={plateFoodImages[id]}
      style={[
        styles.image,
        {
          left: plateLeft + (plateSize * left) / 100,
          top: plateTop + (plateSize * top) / 100,
          width: (plateSize * portionSize) / 100,
          height: (plateSize * portionSize) / 100,
          transform: [{ rotate: `${rotation}deg` }],

          // Keep bread behind the other portions.
          zIndex: id === "bakery" ? 1 : 2,
        },
      ]}
      contentFit="contain"
      accessible={false}
    />
  );
})}

      {/* Place coffee and tea beside the upper-left edge. */}
      {hasCoffeeTea && (
        <Image
          source={coffeeTeaImage}
          style={[
            styles.image,
            {
              left: 0,
              top: sceneSize * 0.08,
              width: coffeeTeaSize,
              height: coffeeTeaSize,
            },
          ]}
          contentFit="contain"
          accessible={false}
        />
      )}

      {/* Place juice above the upper-right edge. */}
      {hasJuice && (
        <Image
          source={juiceImage}
          style={[
            styles.image,
            {
              right: 0,
              top: sceneSize * 0.015,
              width: juiceSize,
              height: juiceSize,
            },
          ]}
          contentFit="contain"
          accessible={false}
        />
      )}

      {/* Place dessert beside the lower-left edge. */}
      {dessertOnSide && (
        <View
          style={[
            styles.image,
            {
              left: 0,
              top: sceneSize * 0.68,
              width: dessertSize,
              height: dessertSize,
            },
          ]}
        >
          <Image
            source={plateImage}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessible={false}
          />

          <Image
            source={plateFoodImages.desserts}
            style={styles.sideDessert}
            contentFit="contain"
            accessible={false}
          />
        </View>
      )}

      {/* Use the main plate when dessert is selected alone. */}
      {hasDessert && !dessertOnSide && (
        <Image
          source={plateFoodImages.desserts}
          style={[
            styles.image,
            {
              left: plateLeft + plateSize * 0.25,
              top: plateTop + plateSize * 0.25,
              width: plateSize * 0.5,
              height: plateSize * 0.5,
            },
          ]}
          contentFit="contain"
          accessible={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: {
    // Keep the table centered on the page.
    position: "relative",
    alignSelf: "center",

    // Keep image coordinates consistent in Arabic layouts.
    direction: "ltr",
  },

  image: {
    position: "absolute",
  },

  sideDessert: {
    // Leave the decorative rim visible around dessert.
    position: "absolute",
    left: "14%",
    top: "14%",
    width: "72%",
    height: "72%",
  },
});