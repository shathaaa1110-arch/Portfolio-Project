import { StyleSheet, View } from "react-native";
import { CuisineCard } from "./CuisineCard";

// Keep each seating choice connected to its illustration.
const seatingOptions = [
  {
    id: "families",
    label: "عائلات",
    image: require(
      "../../../../assets/images/preferences/seating/families.png"
    ),
  },
  {
    id: "quiet",
    label: "هادئ",
    image: require(
      "../../../../assets/images/preferences/seating/quiet.png"
    ),
  },
  {
    id: "indoor",
    label: "داخلية",
    image: require(
      "../../../../assets/images/preferences/seating/indoor.png"
    ),
  },
  {
    id: "friends",
    label: "أصدقاء",
    image: require(
      "../../../../assets/images/preferences/seating/friends.png"
    ),
  },
  {
    id: "none",
    label: "بدون تفضيل",
    image: require(
      "../../../../assets/images/preferences/seating/no-preference.png"
    ),
  },
  {
    id: "outdoor",
    label: "خارجية",
    image: require(
      "../../../../assets/images/preferences/seating/outdoor.png"
    ),
  },
];

type SeatingChoicesProps = {
  selected: string[];
  onChange: (choices: string[]) => void;
};

export function SeatingChoices({
  selected,
  onChange,
}: SeatingChoicesProps) {
  function choose(id: string) {
    // Clear the choices when no preference is selected.
    if (id === "none") {
      onChange([]);
      return;
    }

    // Toggle only the pressed choice.
    const nextChoices = selected.includes(id)
      ? selected.filter((choice) => choice !== id)
      : [...selected, id];

    onChange(nextChoices);
  }

  return (
    <View style={styles.grid}>
      {seatingOptions.map((option) => (
        <CuisineCard
          key={option.id}
          label={option.label}
          image={option.image}
          selected={
            option.id === "none"
              ? selected.length === 0
              : selected.includes(option.id)
          }
          onPress={() => choose(option.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    // Show two cards per row, starting from the right.
    direction: "ltr",
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
});