package dev.noctilume.demo.eyeopener.world;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;
import dev.noctilume.demo.eyeopener.contract.LikeCommand;

public interface LikeWorld extends AutoCloseable {
    void initialize();

    BusinessResponse apply(LikeCommand command);

    WorldSnapshot snapshot();

    @Override
    default void close() {
    }
}
