import { Image, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { SignatureData } from "../store/billStore";

interface SignaturePreviewProps {
  signature?: SignatureData;
  width?: number;
  height?: number;
}

export default function SignaturePreview({
  signature,
  width = 150,
  height = 55,
}: SignaturePreviewProps) {
  if (!signature) return null;

  if (signature.type === "svg") {
    return <SvgXml xml={signature.svgMarkup} width={width} height={height} />;
  }

  return (
    <View style={styles.wrap}>
      <Image
        source={{ uri: signature.uri }}
        style={{ width, height }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
