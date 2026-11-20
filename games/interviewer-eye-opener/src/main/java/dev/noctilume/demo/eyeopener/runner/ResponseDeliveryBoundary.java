package dev.noctilume.demo.eyeopener.runner;

import dev.noctilume.demo.eyeopener.contract.BusinessResponse;

public final class ResponseDeliveryBoundary {
    public DeliveryOutcome pass(BusinessResponse systemResponse, Delivery delivery) {
        BusinessResponse clientResponse = delivery == Delivery.DELIVERED ? systemResponse : null;
        return new DeliveryOutcome(systemResponse, clientResponse, delivery);
    }

    public record DeliveryOutcome(
            BusinessResponse systemResponse,
            BusinessResponse clientResponse,
            Delivery delivery
    ) {
    }
}
