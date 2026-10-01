import React from "react";
import {
    Modal,
    Platform,
    StyleSheet,
    View,
    type ModalProps,
} from "react-native";

export default function IOSFriendlyModal({
  visible = true,
  children,
  ...modalProps
}: ModalProps) {
  if (Platform.OS === "ios") {
    if (!visible) return null;
    return <View style={styles.overlay}>{children}</View>;
  }

  return (
    <Modal visible={visible} {...modalProps}>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
  },
});
